/** Message types for Chrome runtime messaging between components */

export type ExtensionMessage =
  | ToggleMessage
  | PrefsUpdateMessage
  | PrefsRequestMessage
  | PrefsResponseMessage
  | VoiceStartMessage
  | VoiceStopMessage
  | VoiceResultMessage
  | VoiceErrorMessage
  | StatusRequestMessage
  | StatusResponseMessage;

export interface ToggleMessage {
  type: "TOGGLE_TRANSLITERATION";
  enabled?: boolean;
}

export interface PrefsUpdateMessage {
  type: "PREFS_UPDATE";
  prefs: Partial<import("./types").UserPreferences>;
}

export interface PrefsRequestMessage {
  type: "PREFS_REQUEST";
}

export interface PrefsResponseMessage {
  type: "PREFS_RESPONSE";
  prefs: import("./types").UserPreferences;
}

export interface VoiceStartMessage {
  type: "VOICE_START";
  lang: string;
}

export interface VoiceStopMessage {
  type: "VOICE_STOP";
}

export interface VoiceResultMessage {
  type: "VOICE_RESULT";
  transcript: string;
  isFinal: boolean;
}

export interface VoiceErrorMessage {
  type: "VOICE_ERROR";
  error: string;
}

export interface StatusRequestMessage {
  type: "STATUS_REQUEST";
}

export interface StatusResponseMessage {
  type: "STATUS_RESPONSE";
  enabled: boolean;
  language: string;
}
