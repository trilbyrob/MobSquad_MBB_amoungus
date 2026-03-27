import { world, system, Player } from "@minecraft/server";

/*
    MobSquad:mbb_among-us
    Infirmary / return / skull marker test version

    This version:
    - gives each player one pirates book once
    - when a player hits another player with mobsquadmbb:pirates_book:
        - stores the victim's hit location
        - stores the skull marker location
        - places a skull marker on the floor where they were hit
        - teleports them to the infirmary
        - sends them a message
        - after 15 seconds sets them to spectator
        - after 1 minute total returns them to the saved hit point
        - removes the skull marker
        - sets them back to survival
*/

const playersGivenBook = new Set<string>();

const INFIRMARY = {
    x: -133.96,
    y: 84.00,
    z: -108.50
};

const storedHitLocations = new Map<string, { x: number; y: number; z: number }>();
const storedMarkerLocations = new Map<string, { x: number; y: number; z: number }>();

system.runTimeout(() => {
    world.sendMessage("§aMobSquad:mbb_among-us script has started.");
}, 40);

system.runInterval(() => {
    const players = world.getAllPlayers();

    for (const player of players) {
        const playerId = player.id;

        if (!playersGivenBook.has(playerId)) {
            player.runCommand("give @s mobsquadmbb:pirates_book 1");
            player.sendMessage("§6You have been given the pirates book.");
            playersGivenBook.add(playerId);
        }
    }
}, 40);

world.afterEvents.entityHitEntity.subscribe((event) => {
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

    // Optional safety: stop repeated hits while this player is already "dead"
    if (storedHitLocations.has(hitPlayer.id)) {
        attackingPlayer.sendMessage("§eThat player is already in the pirate hit flow.");
        return;
    }

    const inventoryComponent = attackingPlayer.getComponent("minecraft:inventory");

    if (!inventoryComponent) {
        return;
    }

    const container = inventoryComponent.container;

    if (!container) {
        return;
    }

    const selectedSlot = attackingPlayer.selectedSlotIndex;
    const selectedItem = container.getItem(selectedSlot);

    if (!selectedItem) {
        return;
    }

    if (selectedItem.typeId !== "mobsquadmbb:pirates_book") {
        return;
    }

    // Save the exact return location
    storedHitLocations.set(hitPlayer.id, {
        x: hitPlayer.location.x,
        y: hitPlayer.location.y,
        z: hitPlayer.location.z
    });

    // Save the floor location for the skull marker
    const markerLocation = {
        x: Math.floor(hitPlayer.location.x),
        y: Math.floor(hitPlayer.location.y),
        z: Math.floor(hitPlayer.location.z)
    };

    storedMarkerLocations.set(hitPlayer.id, markerLocation);

    // Try placing a wither skeleton skull marker on the floor.
    // If your Bedrock version does not like this command, swap it temporarily to gold_block.
    try {
        hitPlayer.dimension.runCommand(
            "setblock " 
                + markerLocation.x + " " 
                + markerLocation.y + " " 
                + markerLocation.z 
                + " minecraft:wither_skeleton_skull"
        );
    } catch (error) {
        attackingPlayer.sendMessage("§cSkull placement failed - using gold block fallback.");
        hitPlayer.dimension.runCommand(
            "setblock " +
            markerLocation.x + " " +
            markerLocation.y + " " +
            markerLocation.z +
            " gold_block replace"
        );
    }

    // Teleport victim to infirmary
    hitPlayer.teleport(
        {
            x: INFIRMARY.x,
            y: INFIRMARY.y,
            z: INFIRMARY.z
        },
        {
            dimension: hitPlayer.dimension
        }
    );

    hitPlayer.sendMessage("§cYou have been hit by a pirate.");
    attackingPlayer.sendMessage("§aPirate hit applied to " + hitPlayer.name);

    // After 15 seconds, set spectator
    system.runTimeout(() => {
        try {
            hitPlayer.runCommand("gamemode spectator @s");
            hitPlayer.sendMessage("§7You are now in spectator mode.");
        } catch (error) {
            world.sendMessage("§cFailed to set spectator mode.");
        }
    }, 15 * 20);

    // After 1 minute total, return player, remove skull, restore survival
    system.runTimeout(() => {
        const savedLocation = storedHitLocations.get(hitPlayer.id);
        const savedMarker = storedMarkerLocations.get(hitPlayer.id);

        if (!savedLocation) {
            return;
        }

        try {
            // Remove the skull marker first
            if (savedMarker) {
                hitPlayer.dimension.runCommand(
                    "setblock " +
                    savedMarker.x + " " +
                    savedMarker.y + " " +
                    savedMarker.z +
                    " air replace"
                );
            }

            // Restore survival
            hitPlayer.runCommand("gamemode survival @s");

            // Return to saved hit location
            hitPlayer.teleport(
                {
                    x: savedLocation.x,
                    y: savedLocation.y,
                    z: savedLocation.z
                },
                {
                    dimension: hitPlayer.dimension
                }
            );

            hitPlayer.sendMessage("§aYou have been returned to the hit location.");

            storedHitLocations.delete(hitPlayer.id);
            storedMarkerLocations.delete(hitPlayer.id);
        } catch (error) {
            world.sendMessage("§cFailed to return player to saved location.");
        }
    }, 60 * 20);
});