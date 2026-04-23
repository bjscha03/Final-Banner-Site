import { getConversation, resetConversation, updateConversation } from "./stateStore.js";

const TAX_RATE = 0.06;
const PRICE_PER_SQFT = 4.5;
const POLE_POCKETS_PRICE_PER_ITEM = 20;

const PRODUCT_TYPES = [
  { value: "banner", aliases: ["banner", "banners"] },
  { value: "yard sign", aliases: ["yard sign", "yard signs", "yardsign", "yard-sign"] },
  { value: "car magnet", aliases: ["car magnet", "car magnets", "carmagnet", "car-magnet"] },
];

const normalizeMessage = (message) => message.toLowerCase().trim();

const detectProductType = (message) => {
  const normalized = normalizeMessage(message);
  const product = PRODUCT_TYPES.find(({ aliases }) =>
    aliases.some((alias) => normalized.includes(alias)),
  );
  return product?.value ?? null;
};

const parseSize = (message) => {
  const match = message.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;

  const width = Number.parseFloat(match[1]);
  const height = Number.parseFloat(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width,
    height,
    raw: `${width}x${height}`,
  };
};

const parseQuantity = (message) => {
  const value = Number.parseInt(message.trim(), 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
};

const isPolePockets = (addOns) => normalizeMessage(addOns).includes("pole pockets");

const calculateTotal = ({ size, quantity, addOns }) => {
  const sqFt = size.width * size.height;
  const baseTotal = sqFt * PRICE_PER_SQFT * quantity;
  const addOnTotal = isPolePockets(addOns) ? POLE_POCKETS_PRICE_PER_ITEM * quantity : 0;
  const subtotal = baseTotal + addOnTotal;
  return subtotal * (1 + TAX_RATE);
};

const formatCurrency = (value) => `$${value.toFixed(2)}`;

const buildPaymentLink = (total) => `https://paypal.me/yourstore/${total.toFixed(2)}`;

const buildStartPrompt = () =>
  "What would you like to order? (banner, yard sign, or car magnet)";

const handlePayCommand = (conversation) => {
  if (!conversation.total) {
    return buildStartPrompt();
  }

  return buildPaymentLink(conversation.total);
};

export const processSmsMessage = ({ userId, message }) => {
  const trimmedMessage = message?.trim();
  if (!trimmedMessage) {
    return "Please send a message to continue your order.";
  }

  const normalizedMessage = normalizeMessage(trimmedMessage);
  const currentConversation = getConversation(userId);

  if (normalizedMessage === "pay") {
    return handlePayCommand(currentConversation);
  }

  if (normalizedMessage === "restart") {
    resetConversation(userId);
    return buildStartPrompt();
  }

  switch (currentConversation.step) {
    case "START": {
      const productType = detectProductType(trimmedMessage);

      if (!productType) {
        return buildStartPrompt();
      }

      updateConversation(userId, { productType, step: "SIZE" });
      return "What size do you need? (example: 4x2)";
    }

    case "SIZE": {
      const size = parseSize(trimmedMessage);

      if (!size) {
        return "Please send a valid size like 4x2.";
      }

      updateConversation(userId, { size, step: "MATERIAL" });
      return "What material? (13oz, 15oz, 18oz, mesh)";
    }

    case "MATERIAL":
      updateConversation(userId, {
        material: trimmedMessage,
        step: "ADDONS",
      });
      return "Any add-ons? (grommets, pole pockets, none)";

    case "ADDONS":
      updateConversation(userId, {
        addOns: trimmedMessage,
        step: "QTY",
      });
      return "How many do you need?";

    case "QTY": {
      const quantity = parseQuantity(trimmedMessage);

      if (!quantity) {
        return "Please send a valid quantity (for example: 2).";
      }

      const latestConversation = updateConversation(userId, {
        quantity,
      });
      const total = calculateTotal({
        size: latestConversation.size,
        quantity,
        addOns: latestConversation.addOns,
      });

      updateConversation(userId, {
        total,
        step: "COMPLETE",
      });

      return `Your total is ${formatCurrency(total)}. Reply PAY to get checkout link.`;
    }

    case "COMPLETE":
      return "Reply PAY to get checkout link, or send RESTART to start a new order.";

    default:
      resetConversation(userId);
      return buildStartPrompt();
  }
};
