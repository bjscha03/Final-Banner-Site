import React from 'react';
export const AdminAIActionsPanel: React.FC<{error:string|null}> = ({error}) => error ? <div className="rounded border border-red-500/50 bg-red-900/20 text-red-100 p-3">{error}</div> : null;
