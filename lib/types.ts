export type Privacy = "everyone" | "contacts";

export type UserProfile = {
  uid: string;
  displayName: string;
  username: string;
  usernameLower: string;
  about: string;
  photoURL: string;
  publicKey: string;
  lastSeen: number;
  online: boolean;
  privacy: { lastSeen: Privacy; photo: Privacy; about: Privacy };
};

export type MemberInfo = {
  role: "admin" | "member";
  joinedAt: number;
  pinned?: boolean;
  archived?: boolean;
  mutedUntil?: number;
  unread?: number;
};

export type LastMessage = {
  type: string;
  senderId: string;
  at: number;
  preview: string;
};

export type ChatRecord = {
  id: string;
  type: "direct" | "group";
  memberIds: string[];
  members: Record<string, MemberInfo>;
  title: string;
  photoURL: string;
  updatedAt: number;
  lastMessage: LastMessage | null;
  disappearingMs: number | null;
  currentEpoch: number;
  epochs: Record<string, Record<string, string>>;
};

export type MessageKind = "text" | "image" | "video" | "file" | "audio";

export type MessageRecord = {
  id: string;
  senderId: string;
  createdAt: number;
  type: MessageKind;
  body: string;
  ciphertext: string;
  nonce: string;
  wraps: Record<string, string>;
  epoch: number | null;
  contentKeyWrap: string | null;
  replyTo: string | null;
  editedAt: number | null;
  deletedForAll: boolean;
  deletedFor: string[];
  starredBy: string[];
  reactions: Record<string, string>;
  deliveredTo: string[];
  readBy: string[];
  filePath: string | null;
  fileNonce: string | null;
  fileName: string | null;
  fileMime: string | null;
  expiresAt: number | null;
};

export type StatusItem = {
  id: string;
  uid: string;
  body: string;
  ciphertext: string;
  nonce: string;
  wraps: Record<string, string>;
  type: "text" | "image" | "video";
  filePath: string | null;
  fileNonce: string | null;
  createdAt: number;
  expiresAt: number;
  viewers: Record<string, number>;
};

export type CallRecord = {
  id: string;
  callerId: string;
  calleeId: string;
  video: boolean;
  state: "ringing" | "active" | "ended";
  offer: { type: RTCSdpType; sdp: string } | null;
  answer: { type: RTCSdpType; sdp: string } | null;
  createdAt: number;
};
