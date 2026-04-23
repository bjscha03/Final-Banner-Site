const conversations = new Map();

const createInitialState = () => ({
  step: "START",
  productType: null,
  size: null,
  material: null,
  addOns: null,
  quantity: null,
  total: null,
});

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
