import {
  createOrUpdateSessionForUser,
  getActiveSessionForUser,
  getConversation,
  resetConversation,
  SESSION_STATUSES,
  updateConversation,
} from "./stateStore.js";
import { calculatePricing } from "../../src/lib/pricingEngine";
import { calcYardSignPricing } from "../../src/lib/yard-sign-pricing";

const PAYPAL_STORE_PATH = process.env.SMS_PAYPAL_STORE ?? "yourstore";
const SMS_BASE_URL = process.env.SMS_BASE_URL ?? "http://localhost:3001";
const PAYMENT_KEYWORDS = new Set(["pay", "checkout", "payment"]);

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

const stripSpaces = (value) =>
  value
    .split("")
    .filter((char) => char !== " ")
    .join("");

const isNumericToken = (value) => {
  if (!value) return false;

  let dotCount = 0;
  for (const char of value) {
    if (char === ".") {
      dotCount += 1;
      if (dotCount > 1) return false;
      continue;
    }

    if (char < "0" || char > "9") return false;
  }

  return true;
};

const parseSize = (message) => {
  const compact = stripSpaces(message).toLowerCase();
  const separatorIndex = compact.indexOf("x");
  const lastSeparatorIndex = compact.lastIndexOf("x");

  if (separatorIndex <= 0 || separatorIndex !== lastSeparatorIndex || separatorIndex >= compact.length - 1) {
    return null;
  }

  const widthToken = compact.slice(0, separatorIndex);
  const heightToken = compact.slice(separatorIndex + 1);

  if (!isNumericToken(widthToken) || !isNumericToken(heightToken)) {
    return null;
  }

  const width = Number.parseFloat(widthToken);
  const height = Number.parseFloat(heightToken);

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
  if (Number.isNaN(value) || value <= 0) return null;
  return value;
};

const formatCurrency = (value) => `$${value.toFixed(2)}`;

const buildPaymentLink = (total) =>
  `https://paypal.me/${encodeURIComponent(PAYPAL_STORE_PATH)}/${total.toFixed(2)}`;

const buildStartPrompt = () =>
  "What would you like to order? (banner, yard sign, or car magnet)";

export const createPaymentSummary = (session) => {
  if (!session?.config?.size || !session?.config?.quantity) {
    return null;
  }

  const normalizedProductType = (session.config.productType ?? "banner")
    .toLowerCase()
    .replaceAll(" ", "_");
  const normalizedMaterial = (session.config.material ?? "13oz").toLowerCase();
  const normalizedAddOns = (session.config.addOns ?? "none").toLowerCase();
  const quantity = Number.parseInt(`${session.config.quantity}`, 10) || 1;
  const widthIn = (Number(session.config.size.width) || 0) * 12;
  const heightIn = (Number(session.config.size.height) || 0) * 12;

  let subtotalCents = 0;
  let taxCents = 0;
  let totalCents = 0;

  if (normalizedProductType === "car_magnet") {
    const pricing = calculatePricing({
      productType: "car_magnet",
      widthIn,
      heightIn,
      quantity,
    });
    subtotalCents = pricing.subtotalCents;
    taxCents = pricing.taxCents;
    totalCents = pricing.totalCents;
  } else if (normalizedProductType === "yard_sign") {
    const isDoubleSided = normalizedMaterial.includes("double");
    const addStepStakes = normalizedAddOns.includes("stake");
    const pricing = calcYardSignPricing(
      isDoubleSided ? "double" : "single",
      quantity,
      addStepStakes,
      addStepStakes ? quantity : 0,
      0,
    );
    subtotalCents = pricing.totalCents;
    taxCents = pricing.taxCents;
    totalCents = pricing.totalWithTaxCents;
  } else {
    const polePockets = normalizedAddOns.includes("pole") ? "top-bottom" : "none";
    const addRope = normalizedAddOns.includes("rope");
    const grommets = normalizedAddOns.includes("grommet") ? "every-2-3ft" : "none";
    const pricing = calculatePricing({
      productType: "banner",
      widthIn,
      heightIn,
      quantity,
      material: normalizedMaterial,
      addRope,
      polePockets,
      grommets,
    });
    subtotalCents = pricing.subtotalCents;
    taxCents = pricing.taxCents;
    totalCents = pricing.totalCents;
  }

  return {
    productType: session.config.productType ?? "banner",
    size: session.config.size.raw,
    quantity,
    material: session.config.material ?? "13oz",
    addOns: session.config.addOns ?? "none",
    roundedCorners: Boolean(session.config.roundedCorners),
    subtotal: Number((subtotalCents / 100).toFixed(2)),
    tax: Number((taxCents / 100).toFixed(2)),
    total: Number((totalCents / 100).toFixed(2)),
  };
};

export const buildPlaceholderPaymentUrl = (session) => {
  const summary = createPaymentSummary(session);
  if (!summary) return null;
  return `https://paypal.me/${encodeURIComponent(PAYPAL_STORE_PATH)}/${summary.total.toFixed(2)}`;
};

const handlePayCommand = (conversation) => {
  if (!conversation.total) {
    return buildStartPrompt();
  }

  return buildPaymentLink(conversation.total);
};

const handleSessionPayCommand = (session) => {
  if (!session) {
    return null;
  }

  if (session.status !== SESSION_STATUSES.AWAITING_PAYMENT) {
    return null;
  }

  const summary = createPaymentSummary(session);
  if (!summary) {
    return "We couldn't load your order summary yet. Please reply again in a moment.";
  }

  if (!session.paymentUrl) {
    return "Your design is approved. We’re generating your payment link now.";
  }

  const orderLabel = summary.productType ? `${summary.productType}` : "banner";
  return [
    `Your ${orderLabel} order is ready.`,
    `Size: ${summary.size}`,
    `Qty: ${summary.quantity}`,
    `Total: ${formatCurrency(summary.total)}`,
    `Pay here: ${session.paymentUrl}`,
  ].join("\n");
};

export const processSmsMessage = ({ userId, message }) => {
  const trimmedMessage = message?.trim();
  if (!trimmedMessage) {
    return "Please send a message to continue your order.";
  }

  const normalizedMessage = normalizeMessage(trimmedMessage);
  const currentConversation = getConversation(userId);

  if (PAYMENT_KEYWORDS.has(normalizedMessage)) {
    const activeSession = getActiveSessionForUser(userId);
    const sessionPayReply = handleSessionPayCommand(activeSession);
    if (sessionPayReply) {
      return sessionPayReply;
    }
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
      const session = createOrUpdateSessionForUser({
        userId,
        config: {
          productType: latestConversation.productType,
          size: latestConversation.size,
          material: latestConversation.material,
          addOns: latestConversation.addOns,
          quantity,
          roundedCorners: false,
        },
      });
      const paymentSummary = createPaymentSummary(session);
      const total = paymentSummary?.total ?? 0;

      updateConversation(userId, {
        total,
        step: "COMPLETE",
      });

      return [
        `Your total is ${formatCurrency(total)}.`,
        `Upload and approve your design here: ${SMS_BASE_URL}/text-order/${session.sessionId}`,
        "After approval, reply PAY for your payment link.",
      ].join("\n");
    }

    case "COMPLETE":
      return "Reply PAY to get checkout link, or send RESTART to start a new order.";

    default:
      resetConversation(userId);
      return buildStartPrompt();
  }
};
