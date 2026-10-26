import {
  APPLIANCE_SIZE,
  COMPUTER,
  CUSTOMER_SIZE,
  DELIVERY_BAY,
  FRIDGE,
  PASS,
  PHONE,
  RECIPE_BOOK,
  REGISTER,
  TABLE_SIZE,
  TICKET_SLOTS,
  TICKET_SLOT_SIZE,
  type Box,
  type Interaction,
  type KitchenState,
} from "@cacao/shared";
import type { Target } from "./sceneStyle.ts";

/** A target for a piece of furniture: outlined as `kind`, the hint goes above or below `box`. */
function furniture(kind: string, box: Box, id = ""): Target {
  return { kind, id, x: box.x, top: box.y - box.height / 2, bottom: box.y + box.height / 2 };
}

/**
 * What to outline for an interaction (a customer, a table, a ticket, an appliance, a piece of
 * furniture) and where its edges are, to place the hint. `customerPosition` is where a customer is
 * drawn right now, since their sprite catches up with the server smoothly.
 */
export function interactionTarget(
  interaction: Interaction,
  state: KitchenState,
  customerPosition: (id: string) => { x: number; y: number } | undefined,
): Target | null {
  switch (interaction.kind) {
    case "readTicket": {
      const ticket = state.tickets.get(interaction.ticketId);
      if (!ticket) return null;
      const slot = TICKET_SLOTS[ticket.slot];
      return furniture("ticket", { ...slot, width: TICKET_SLOT_SIZE, height: TICKET_SLOT_SIZE }, interaction.ticketId);
    }
    case "placeOnPass":
    case "takeFromPass":
      return furniture("pass", PASS);
    case "openPhone":
      return furniture("phone", PHONE);
    case "openComputer":
      return furniture("computer", COMPUTER);
    case "openRecipeBook":
      return furniture("recipeBook", RECIPE_BOOK);
  }

  const applianceId = interaction.kind === "openStorage" ? interaction.applianceId
    : interaction.kind === "openAppliance" || interaction.kind === "continueRecipe" || interaction.kind === "takeFromAppliance"
      ? interaction.applianceId
    : interaction.kind === "blocked" && interaction.station === "appliance" ? interaction.stationId
    : undefined;
  if (interaction.kind === "openStorage" && interaction.storage === "fridge") return furniture("fridge", FRIDGE);
  if (applianceId) {
    const appliance = state.appliances.get(applianceId);
    return appliance ? furniture("appliance", { ...appliance, width: APPLIANCE_SIZE, height: APPLIANCE_SIZE }, applianceId) : null;
  }
  if (interaction.kind === "blocked" && interaction.station === "pass") return furniture("pass", PASS);

  if (interaction.kind === "action" && interaction.action === "receiveDelivery") return furniture("truck", DELIVERY_BAY);
  if (interaction.kind === "action" && interaction.action === "checkout") return furniture("register", REGISTER);
  if (interaction.kind === "seat" || interaction.kind === "action") {
    const tableId = interaction.kind === "seat" ? interaction.tableId : interaction.targetId;
    const table = state.tables.get(tableId);
    return table ? furniture("table", { ...table, width: TABLE_SIZE, height: TABLE_SIZE }, tableId) : null;
  }

  const customerId = "customerId" in interaction ? interaction.customerId : undefined;
  const position = customerId && customerPosition(customerId);
  if (!customerId || !position) return null;
  const half = CUSTOMER_SIZE / 2;
  // The hint goes a little higher, to clear the patience bar.
  return { kind: "customer", id: customerId, x: position.x, top: position.y - half - 12, bottom: position.y + half };
}
