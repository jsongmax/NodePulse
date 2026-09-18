export * from './common.js';
export * from './agent.js';
export * from './hub.js';
export * from './viewer.js';
export * from './api.js';

import { agentMessageSchema, type AgentMessage } from './agent.js';
import {
  hubToViewerMessageSchema,
  viewerToHubMessageSchema,
  type HubToViewerMessage,
  type ViewerToHubMessage,
} from './viewer.js';
import { hubToAgentMessageSchema, type HubToAgentMessage } from './hub.js';

export function parseAgentMessage(data: unknown): AgentMessage {
  if (typeof data === 'string') {
    return agentMessageSchema.parse(JSON.parse(data));
  }
  return agentMessageSchema.parse(data);
}

export function parseViewerMessage(data: unknown): ViewerToHubMessage {
  if (typeof data === 'string') {
    return viewerToHubMessageSchema.parse(JSON.parse(data));
  }
  return viewerToHubMessageSchema.parse(data);
}

export function parseHubToAgentMessage(data: unknown): HubToAgentMessage {
  if (typeof data === 'string') {
    return hubToAgentMessageSchema.parse(JSON.parse(data));
  }
  return hubToAgentMessageSchema.parse(data);
}

export function parseHubToViewerMessage(data: unknown): HubToViewerMessage {
  if (typeof data === 'string') {
    return hubToViewerMessageSchema.parse(JSON.parse(data));
  }
  return hubToViewerMessageSchema.parse(data);
}
