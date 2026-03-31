import { world, system, Player, GameMode } from "@minecraft/server";


/*
    Youre_It
    Hot Tag - main game skeleton

    v1 goal:
    - players join the queue
    - game starts when enough players are present
    - countdown runs
    - one random player becomes IT
    - when IT tags someone:
        - old IT gains 1 point
        - tagged player becomes new IT
        - new IT is locked for 10 seconds
    - round timer runs
    - after 3 rounds, highest score wins

    Notes:
    - this is a skeleton / framework version
    - some parts are placeholders for you to fill in
    - coordinate values still need setting
*/

/* =========================================================
   CONFIG
   ========================================================= */

const MIN_PLAYERS = 2;
const TOTAL_ROUNDS = 3;
//const ROUND_DURATION_SECONDS = 60;
const ROUND_DURATION_SECONDS = 2 * 60;
const TAG_LOCKOUT_SECONDS = 19;

// Change these later to your real locations

const JOIN_PAD1 = { x: -124, y: 70, z: -68 };
const JOIN_PAD2 = { x: -124, y: 70, z: -70 };
const JOIN_PAD3 = { x: -124, y: 70, z: -72 };

const LEAVE_PAD = { x: -126, y: 71, z: -81 }
const START_PAD = { x: -119, y: 69, z: -63 }

const LOBBY_SPAWN = { x: -119, y: 70, z: -64 };
const ARENA_SPAWN = { x: -117, y: 72, z: -93 };
const PRISON_LOCATION = { x: -133, y: 84, z: -108 };
const OUT_A_PRISON = { x:-129.72, y:84.00, z:-109.32};

const joinPadCooldownPlayers = new Set<string>();
const leavePadCooldownPlayers = new Set<string>();
const startPadCooldownPlayers = new Set<string>();

const USE_ARENA_BOUNDARY = true;
const ARENA_WARNING_DISTANCE = 50;
const ARENA_TELEPORT_DISTANCE = 70;
const warnedOutOfBoundsPlayers = new Set<string>();

// For now this is just a placeholder.
// Later you can replace it with your real join button / join pad logic.
const AUTO_JOIN_ALL_PLAYERS_FOR_TESTING = false;

/* =========================================================
   GAME STATE
   ========================================================= */

type GameState =
    | "lobby"
    | "countdown"
    | "round_active"
    | "round_end"
    | "game_over";

let gameState: GameState = "lobby";
let currentRound = 0;
let roundTimeRemaining = 0;
let currentItPlayerId: string | null = null;

// Players currently queued / participating
const joinedPlayers = new Set<string>();

// Players temporarily locked after becoming IT
const lockedPlayers = new Set<string>();

// Total match score across all rounds
const playerScores = new Map<string, number>();

// Prevent duplicate join messages in testing mode
const announcedJoinedPlayers = new Set<string>();

/* =========================================================
   HELPERS - IS PLAYER ON JOIN, LEAVE, OR START PAD
   ========================================================= */


function isPlayerOnBlock(player: Player, blockPos: { x: number; y: number; z: number }): boolean {
    const playerX = Math.floor(player.location.x);
    const playerY = Math.floor(player.location.y);
    const playerZ = Math.floor(player.location.z);

    return (
        playerX === blockPos.x &&
        playerY === blockPos.y &&
        playerZ === blockPos.z
    );
}

function handleJoinLeaveStartPads(): void {
    const players = getAllPlayers();

    for (const player of players) {
        const playerId = player.id;

        const onJoinPad = isPlayerOnAnyJoinPad(player);
        const onLeavePad = isPlayerOnBlock(player, LEAVE_PAD);
        const onStartPad = isPlayerOnBlock(player, START_PAD);

        /* =========================================
           JOIN PAD
           ========================================= */

        if (onJoinPad) {
            if (!joinPadCooldownPlayers.has(playerId)) {
                addPlayerToQueue(player);
                joinPadCooldownPlayers.add(playerId);
            }
        } else {
            joinPadCooldownPlayers.delete(playerId);
        }

        /* =========================================
           LEAVE PAD
           ========================================= */

        if (onLeavePad) {
            if (!leavePadCooldownPlayers.has(playerId)) {
                removePlayerFromQueue(player);
                leavePadCooldownPlayers.add(playerId);
                if (gameState === "round_active" && !hasEnoughPlayersToContinueRound()) {
                    endRoundEarly("Not enough players remain.");
                }
            }
        } else {
            leavePadCooldownPlayers.delete(playerId);
        }

        /* =========================================
           START PAD
           ========================================= */

        if (onStartPad) {
            if (!startPadCooldownPlayers.has(playerId)) {
                if (gameState === "lobby") {
                    if (canStartGame()) {
                        world.sendMessage("§a" + player.name + " started the game.");
                        startCountdown();
                    } else {
                        player.sendMessage("§cNot enough players to start.");
                    }
                } else {
                    player.sendMessage("§eGame is already in progress.");
                }

                startPadCooldownPlayers.add(playerId);
            }
        } else {
            startPadCooldownPlayers.delete(playerId);
        }
    }
}

function isPlayerOnAnyJoinPad(player: Player): boolean {
    return (
        isPlayerOnBlock(player, JOIN_PAD1) ||
        isPlayerOnBlock(player, JOIN_PAD2) ||
        isPlayerOnBlock(player, JOIN_PAD3)
    );
}

/* =========================================================
   HELPERS - PLAYER LOOKUP
   ========================================================= */

function getAllPlayers(): Player[] {
    return world.getAllPlayers();
}

function getJoinedPlayers(): Player[] {
    const players = getAllPlayers();
    const result: Player[] = [];

    for (const player of players) {
        if (joinedPlayers.has(player.id)) {
            result.push(player);
        }
    }

    return result;
}

function getPlayerById(playerId: string): Player | null {
    const players = getAllPlayers();

    for (const player of players) {
        if (player.id === playerId) {
            return player;
        }
    }

    return null;
}

/* =========================================================
   HELPERS - MESSAGES / UI
   ========================================================= */

function sendMessageToJoinedPlayers(message: string): void {
    const players = getJoinedPlayers();

    for (const player of players) {
        player.sendMessage(message);
    }
}

function showTitleToJoinedPlayers(title: string, subtitle?: string): void {
    const players = getJoinedPlayers();

    for (const player of players) {
        try {
            player.onScreenDisplay.setTitle(title, {
                fadeInDuration: 0,
                stayDuration: 40,
                fadeOutDuration: 10,
                subtitle: subtitle ?? ""
            });
        } catch (error) {
            player.sendMessage(title + (subtitle ? " - " + subtitle : ""));
        }
    }
}

function updateActionBar(): void {
    if (gameState !== "round_active") {
        return;
    }

    const itPlayer = currentItPlayerId ? getPlayerById(currentItPlayerId) : null;
    const itName = itPlayer ? itPlayer.name : "None";

    const minutes = Math.floor(roundTimeRemaining / 60);
    const seconds = roundTimeRemaining % 60;
    const secondsText = seconds < 10 ? "0" + seconds : seconds.toString();

    const text =
        "Round " + currentRound +
        " | Time: " + minutes + ":" + secondsText +
        " | IT: " + itName;

    const players = getJoinedPlayers();

    for (const player of players) {
        try {
            player.onScreenDisplay.setActionBar(text);
        } catch (error) {
            // Ignore if action bar is unavailable in this environment
        }
    }
}

/* =========================================================
   HELPERS - JOIN / LEAVE
   ========================================================= */

function hasEnoughPlayersToContinueRound(): boolean {
    return getJoinedPlayers().length >= MIN_PLAYERS;
}

function addPlayerToQueue(player: Player): void {
    if (joinedPlayers.has(player.id)) {
        return;
    }

    joinedPlayers.add(player.id);

    if (!playerScores.has(player.id)) {
        playerScores.set(player.id, 0);
    }

    player.sendMessage("§aYou joined the next game.");
}

function removePlayerFromQueue(player: Player): void {
    joinedPlayers.delete(player.id);
    lockedPlayers.delete(player.id);

    if (currentItPlayerId === player.id) {
        currentItPlayerId = null;
    }

    player.sendMessage("§eYou left the current/next game.");
}

/* =========================================================
   HELPERS - SCORE
   ========================================================= */

function addScore(playerId: string, amount: number): void {
    const currentScore = playerScores.get(playerId) ?? 0;
    playerScores.set(playerId, currentScore + amount);
}

function getScore(playerId: string): number {
    return playerScores.get(playerId) ?? 0;
}

function showScoresToJoinedPlayers(): void {
    const players = getJoinedPlayers();

    for (const viewer of players) {
        viewer.sendMessage("§6--- Scores ---");

        for (const target of players) {
            viewer.sendMessage(target.name + ": " + getScore(target.id));
        }
    }
}

/* =========================================================
   HELPERS - TELEPORT / RESET
   ========================================================= */

function getRandomArenaSpawn(): { x: number; y: number; z: number } {
    const radius = 9;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;

    return {
        x: ARENA_SPAWN.x + Math.cos(angle) * distance,
        y: ARENA_SPAWN.y,
        z: ARENA_SPAWN.z + Math.sin(angle) * distance
    };
}


function getDistanceFromArenaCenter(player: Player): number {
    const dx = player.location.x - ARENA_SPAWN.x;
    const dz = player.location.z - ARENA_SPAWN.z;

    return Math.sqrt((dx * dx) + (dz * dz));
}

function checkArenaBoundary(): void {
    if (!USE_ARENA_BOUNDARY) {
        return;
    }

    if (gameState !== "round_active") {
        warnedOutOfBoundsPlayers.clear();
        return;
    }

    const players = getJoinedPlayers();

    for (const player of players) {
        // Ignore locked players while they are in prison / spectator lockout
        if (isLocked(player)) {
            continue;
        }

        const distance = getDistanceFromArenaCenter(player);

        // Teleport if too far out
        if (distance >= ARENA_TELEPORT_DISTANCE) {
            teleportPlayer(player, ARENA_SPAWN);
            player.sendMessage("§cYou went too far from the arena and were teleported back.");
            warnedOutOfBoundsPlayers.delete(player.id);
            continue;
        }

        // Warn if outside warning distance
        if (distance >= ARENA_WARNING_DISTANCE) {
            if (!warnedOutOfBoundsPlayers.has(player.id)) {
                player.sendMessage("§eReturn to the arena or you will be teleported back.");
                warnedOutOfBoundsPlayers.add(player.id);
            }
            continue;
        }

        // Back inside safe area, clear warning state
        warnedOutOfBoundsPlayers.delete(player.id);
    }
}

function teleportPlayer(player: Player, location: { x: number; y: number; z: number }): void {
    player.teleport(
        {
            x: location.x,
            y: location.y,
            z: location.z
        },
        {
            dimension: player.dimension
        }
    );
}

function resetPlayerToNormal(player: Player): void {
    try {
        player.runCommand("gamemode survival @s");
        player.runCommand("effect @s clear");
    } catch (error) {
        player.sendMessage("§cFailed to fully reset player state.");
    }
}

function moveJoinedPlayersToArena(): void {
    const players = getJoinedPlayers();

    for (const player of players) {
        resetPlayerToNormal(player);
        teleportPlayer(player, getRandomArenaSpawn());
    }
}

function moveJoinedPlayersToLobby(): void {
    const players = getJoinedPlayers();

    for (const player of players) {
        resetPlayerToNormal(player);
        teleportPlayer(player, LOBBY_SPAWN);
    }
}

/* =========================================================
   HELPERS - IT PLAYER
   ========================================================= */

function clearCurrentItVisuals(): void {
    const players = getJoinedPlayers();

    for (const player of players) {
        try {
            // Placeholder: remove glow / armor / tag visuals here later
            player.runCommand("effect @s clear glowing");
        } catch (error) {
            // Ignore
        }
    }
}

function applyItVisuals(player: Player): void {
    try {
        // Placeholder: glowing is a nice simple first visual
        player.runCommand("effect @s glowing 999999 0 true");
    } catch (error) {
        player.sendMessage("§cFailed to apply IT visuals.");
    }
}

function setCurrentIt(player: Player): void {
    currentItPlayerId = player.id;

    clearCurrentItVisuals();
    applyItVisuals(player);

    showTitleToJoinedPlayers(player.name + " is IT!");
    sendMessageToJoinedPlayers("§c" + player.name + " is now IT!");
}

function chooseRandomIt(): Player | null {
    const players = getJoinedPlayers();

    if (players.length === 0) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * players.length);
    return players[randomIndex];
}

/* =========================================================
   HELPERS - ROUND FLOW
   ========================================================= */

function canStartGame(): boolean {
    return getJoinedPlayers().length >= MIN_PLAYERS;
}

function startCountdown(): void {
    if (gameState !== "lobby") {
        return;
    }

    if (!canStartGame()) {
        world.sendMessage("§cNot enough players to start.");
        return;
    }

    gameState = "countdown";

    let countdown = 5;
    showTitleToJoinedPlayers("Round starts in", countdown.toString());

    const countdownRunId = system.runInterval(() => {
        countdown--;

        if (countdown > 0) {
            showTitleToJoinedPlayers("Round starts in", countdown.toString());
            return;
        }

        system.clearRun(countdownRunId);
        startRound();
    }, 20);
}

function startRound(): void {
    currentRound++;
    roundTimeRemaining = ROUND_DURATION_SECONDS;
    gameState = "round_active";

    lockedPlayers.clear();

    moveJoinedPlayersToArena();

    const chosenIt = chooseRandomIt();

    if (!chosenIt) {
        endRoundEarly("No valid player available to become IT.");
        return;
    }

    setCurrentIt(chosenIt);

    sendMessageToJoinedPlayers("§aRound " + currentRound + " has started.");
}

function endRound(): void {
    gameState = "round_end";
    currentItPlayerId = null;
    lockedPlayers.clear();

    clearCurrentItVisuals();
    moveJoinedPlayersToLobby();

    showTitleToJoinedPlayers("Round Over!");
    showScoresToJoinedPlayers();

    if (currentRound >= TOTAL_ROUNDS) {
        endGame();
        return;
    }

    system.runTimeout(() => {
        gameState = "lobby";

        if (canStartGame()) {
            startCountdown();
        } else {
            world.sendMessage("§eWaiting for enough players for the next round.");
        }
    }, 100);
}

function endRoundEarly(reason: string): void {
    sendMessageToJoinedPlayers("§eRound ended early: " + reason);
    endRound();
}

function endGame(): void {
    gameState = "game_over";

    let highestScore = -1;
    const winners: Player[] = [];

    const players = getJoinedPlayers();

    for (const player of players) {
        const score = getScore(player.id);

        if (score > highestScore) {
            highestScore = score;
            winners.length = 0;
            winners.push(player);
        } else if (score === highestScore) {
            winners.push(player);
        }
    }

    moveJoinedPlayersToLobby();

    if (winners.length === 1) {
        showTitleToJoinedPlayers("Game Over!", winners[0].name + " wins!");
    } else if (winners.length > 1) {
        showTitleToJoinedPlayers("Game Over!", "Shared win!");
    } else {
        showTitleToJoinedPlayers("Game Over!", "No winner.");
    }

    showScoresToJoinedPlayers();

    // Reset round state, keep scores if you want a running session history.
    system.runTimeout(() => {
        currentRound = 0;
        roundTimeRemaining = 0;
        currentItPlayerId = null;
        lockedPlayers.clear();
        gameState = "lobby";

        // If you want a fresh new game each time, uncomment this:
        // playerScores.clear();

        world.sendMessage("§aGame reset. Players can join again.");
    }, 120);
}

/* =========================================================
   HELPERS - TAG LOGIC
   ========================================================= */

function isJoinedPlayer(player: Player): boolean {
    return joinedPlayers.has(player.id);
}

function isCurrentIt(player: Player): boolean {
    return currentItPlayerId === player.id;
}

function isLocked(player: Player): boolean {
    return lockedPlayers.has(player.id);
}

function beginLockoutForNewIt(player: Player): void {
    lockedPlayers.add(player.id);

    // Simple first version:
    // send to prison and put in spectator for 10 seconds
    try {
        teleportPlayer(player, PRISON_LOCATION);
        
        player.setGameMode(GameMode.Adventure);
        player.sendMessage("§eYou are IT, but locked for " + TAG_LOCKOUT_SECONDS + " seconds.");
    } catch (error) {
        player.sendMessage("§cFailed to start IT lockout.");
    }

    system.runTimeout(() => {
        lockedPlayers.delete(player.id);

        try {
            player.runCommand("gamemode survival @s");
            teleportPlayer(player, OUT_A_PRISON);
            player.sendMessage("§aGo! You are now active as IT.");
        } catch (error) {
            player.sendMessage("§cFailed to end IT lockout.");
        }
    }, TAG_LOCKOUT_SECONDS * 20);
}

function handleSuccessfulTag(oldIt: Player, taggedPlayer: Player): void {
    // Award score to old IT
    addScore(oldIt.id, 1);

    // Old IT returns to normal
    try {
        oldIt.runCommand("effect @s clear glowing");
    } catch (error) {
        // Ignore
    }

    // Tagged player becomes the new IT
    setCurrentIt(taggedPlayer);

    // Big messages
    try {
        taggedPlayer.onScreenDisplay.setTitle("You have been tagged!");
    } catch (error) {
        taggedPlayer.sendMessage("§cYou have been tagged!");
    }

    sendMessageToJoinedPlayers("§e" + taggedPlayer.name + " is now IT!");

    // TODO later:
    // - sound effect
    // - particles

    beginLockoutForNewIt(taggedPlayer);
}

/* =========================================================
   MAIN TICK / LOOP
   ========================================================= */

system.runInterval(() => {
    // Temporary testing helper:
    // auto-join all online players while in lobby
    if (AUTO_JOIN_ALL_PLAYERS_FOR_TESTING && gameState === "lobby") {
        const players = getAllPlayers();

        for (const player of players) {
            if (!announcedJoinedPlayers.has(player.id)) {
                addPlayerToQueue(player);
                announcedJoinedPlayers.add(player.id);
            }
        }
    }

    handleJoinLeaveStartPads();

    if (gameState === "round_active") {
        updateActionBar();
    }

    checkArenaBoundary();
}, 20);

system.runInterval(() => {
    if (gameState !== "round_active") {
        return;
    }

    if (!hasEnoughPlayersToContinueRound()) {
        endRoundEarly("Not enough players remain.");
        return;
    }

    roundTimeRemaining--;

    if (roundTimeRemaining <= 0) {
        endRound();
    }
}, 20);

/* =========================================================
   HIT DETECTION
   ========================================================= */

world.afterEvents.entityHitEntity.subscribe((event) => {
    if (gameState !== "round_active") {
        return;
    }

    const damagingEntity = event.damagingEntity;
    const hitEntity = event.hitEntity;

    if (damagingEntity.typeId !== "minecraft:player") {
        return;
    }

    if (hitEntity.typeId !== "minecraft:player") {
        return;
    }

    const attackingPlayer = damagingEntity as Player;
    const hitPlayer = hitEntity as Player;

    // Both players must be in the current game
    if (!isJoinedPlayer(attackingPlayer)) {
        return;
    }

    if (!isJoinedPlayer(hitPlayer)) {
        return;
    }

    // Only the current IT can tag
    if (!isCurrentIt(attackingPlayer)) {
        return;
    }

    // Locked IT cannot tag during cooldown
    if (isLocked(attackingPlayer)) {
        return;
    }

    // Prevent self / duplicate nonsense
    if (attackingPlayer.id === hitPlayer.id) {
        return;
    }

    handleSuccessfulTag(attackingPlayer, hitPlayer);
});

/* =========================================================
   STARTUP
   ========================================================= */

system.runTimeout(() => {
    world.sendMessage("§aYoure_It");

    // Auto-start for testing if enough players are present
    if (AUTO_JOIN_ALL_PLAYERS_FOR_TESTING) {
        system.runTimeout(() => {
            if (gameState === "lobby" && canStartGame()) {
                startCountdown();
            }
        }, 60);
    }
}, 20);