import { world, system, Player } from "@minecraft/server";

/*
    MobSquad:mbb_among-us
    Held-item test version

    This version:
    - shows startup message
    - gives each player one imposters book once
    - only triggers the effect if the attacking player is holding mobsquadmbb:imposters_book
    - for testing on animals/mobs:
        - places a gold block where the hit happened
        - teleports the hit entity upward
*/

const playersGivenBook = new Set<string>();

system.runTimeout(() => {
    world.sendMessage("§aMobSquad:mbb_among-us script has started.");
}, 40);

system.runInterval(() => {
    const players = world.getAllPlayers();

    for (const player of players) {
        const playerId = player.id;

        if (!playersGivenBook.has(playerId)) {
            player.runCommand("give @s mobsquadmbb:imposters_book 1");
            player.sendMessage("§6You have been given the Imposters book.");
            playersGivenBook.add(playerId);
        }
    }
}, 40);

world.afterEvents.entityHitEntity.subscribe((event) => {
    const damagingEntity = event.damagingEntity;
    const hitEntity = event.hitEntity;

    // Only continue if the attacker is a player
    if (damagingEntity.typeId !== "minecraft:player") {
        return;
    }

    const attackingPlayer = damagingEntity as Player;

    // Get the item the player is currently holding
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

    // Only continue if the player is holding the custom imposters book
    if (!selectedItem) {
        return;
    }

    if (selectedItem.typeId !== "mobsquadmbb:imposters_book") {
        return;
    }

    // Ignore hits on players for now - this test is still for animals/mobs
    if (hitEntity.typeId === "minecraft:player") {
        return;
    }

    // Get the location where the entity was hit
    const hitX = Math.floor(hitEntity.location.x);
    const hitY = Math.floor(hitEntity.location.y);
    const hitZ = Math.floor(hitEntity.location.z);

    // Place a gold block where the hit happened
    hitEntity.dimension.runCommand(
        "setblock " + hitX + " " + hitY + " " + hitZ + " gold_block"
    );

    // Teleport the hit entity upward
    hitEntity.teleport(
        {
            x: hitEntity.location.x,
            y: hitEntity.location.y + 130,
            z: hitEntity.location.z
        },
        {
            dimension: hitEntity.dimension
        }
    );

    attackingPlayer.sendMessage("§aImposters book hit detected on: " + hitEntity.typeId);
});
