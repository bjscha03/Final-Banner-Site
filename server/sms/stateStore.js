import { randomUUID } from "node:crypto";

const conversations = new Map();
const sessions = new Map();
const userActiveSession = new Map();

export const SESSION_STATUSES = {
  COLLECTING_DETAILS: "collecting_details",
  AWAITING_UPLOAD: "awaiting_upload",
  UPLOADED: "uploaded",
  DESIGN_APPROVED: "design_approved",
  AWAITING_PAYMENT: "awaiting_payment",
  PAID: "paid",
};

const createInitialState = () => ({
  step: "START",
  productType: null,
  size: null,
  material: null,
  addOns: null,
  quantity: null,
  total: null,
});

const generateSessionId = () =>
  `sms_${Date.now().toString(36)}_${randomUUID().replaceAll("-", "")}`;

export const getConversation = (userId) => {
  if (!conversations.has(userId)) {
    conversations.set(userId, createInitialState());
  }

  return conversations.get(userId);
};

export const updateConversation = (userId, updates) => {
  const current = getConversation(userId);
  const next = { ...current, ...updates };
  conversations.set(userId, next);
  return next;
};

export const resetConversation = (userId) => {
  const reset = createInitialState();
  conversations.set(userId, reset);
  return reset;
};

export const createOrUpdateSessionForUser = ({ userId, config }) => {
  const existingSessionId = userActiveSession.get(userId);

  if (existingSessionId && sessions.has(existingSessionId)) {
    const existing = sessions.get(existingSessionId);
    const updated = {
      ...existing,
      status: SESSION_STATUSES.AWAITING_UPLOAD,
      readyForPayment: false,
      config: {
        ...existing.config,
        ...config,
      },
      updatedAt: new Date().toISOString(),
    };
    sessions.set(existingSessionId, updated);
    return updated;
  }

  const sessionId = generateSessionId();
  const now = new Date().toISOString();
  const created = {
    sessionId,
    userId,
    status: SESSION_STATUSES.AWAITING_UPLOAD,
    readyForPayment: false,
    paymentUrl: null,
    paymentStatus: "pending",
    artworkRef: null,
    previewRef: null,
    approvedArtworkRef: null,
    approvedPreviewRef: null,
    approvedAt: null,
    config,
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(sessionId, created);
  userActiveSession.set(userId, sessionId);
  return created;
};

export const getSession = (sessionId) => sessions.get(sessionId) ?? null;

export const updateSession = (sessionId, updates) => {
  const existing = getSession(sessionId);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  sessions.set(sessionId, updated);
  return updated;
};

export const setSessionStatus = (sessionId, status) => updateSession(sessionId, { status });

export const getActiveSessionForUser = (userId) => {
  const sessionId = userActiveSession.get(userId);
  if (!sessionId) return null;
  return getSession(sessionId);
};
