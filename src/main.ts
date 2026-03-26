import { world, system, Player } from "@minecraft/server";

/*
    MobSquad:mbb_among-us
    Debug player-hit version
*/

const playersGivenBook = new Set<string>();

system.runTimeout(() => {
    world.sendMessage("§aMobSquad script has started.");
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

    // Is attacker a player?
    if (damagingEntity.typeId !== "minecraft:player") {
        return;
    }

    const attackingPlayer = damagingEntity as Player;
    attackingPlayer.sendMessage("§7Hit event fired.");

    // Is victim a player?
    if (hitEntity.typeId !== "minecraft:player") {
        attackingPlayer.sendMessage("§cTarget is not a player: " + hitEntity.typeId);
        return;
    }

    attackingPlayer.sendMessage("§aTarget is a player.");

    // Check held item
    const inventoryComponent = attackingPlayer.getComponent("minecraft:inventory");
    if (!inventoryComponent) {
        attackingPlayer.sendMessage("§cNo inventory component.");
        return;
    }

    const container = inventoryComponent.container;
    if (!container) {
        attackingPlayer.sendMessage("§cNo container.");
        return;
    }

    const selectedSlot = attackingPlayer.selectedSlotIndex;
    const selectedItem = container.getItem(selectedSlot);

    if (!selectedItem) {
        attackingPlayer.sendMessage("§cNo selected item.");
        return;
    }

    attackingPlayer.sendMessage("§eHolding: " + selectedItem.typeId);

    if (selectedItem.typeId !== "mobsquadmbb:pirates_book") {
        attackingPlayer.sendMessage("§cWrong item.");
        return;
    }

    attackingPlayer.sendMessage("§aCorrect item detected.");

    const hitPlayer = hitEntity as Player;

    const hitX = Math.floor(hitPlayer.location.x);
    const hitY = Math.floor(hitPlayer.location.y);
    const hitZ = Math.floor(hitPlayer.location.z);

    hitPlayer.dimension.runCommand(
        "setblock " + hitX + " " + hitY + " " + hitZ + " gold_block"
    );

    hitPlayer.teleport(
        {
            x: hitPlayer.location.x,
            y: hitPlayer.location.y + 40,
            z: hitPlayer.location.z
        },
        {
            dimension: hitPlayer.dimension
        }
    );

    attackingPlayer.sendMessage("§aEffect applied.");
    hitPlayer.sendMessage("§cYou were hit.");
});