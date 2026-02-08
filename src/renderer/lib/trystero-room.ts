import { joinRoom, Room } from 'trystero/torrent';

const APP_ID = 'podcast-recorder-v1';

export interface Peer {
  id: string;
  name: string;
  stream: MediaStream | null;
  muted: boolean;
}

export interface RoomSession {
  room: Room;
  roomId: string;
  sendName: (name: string) => void;
  onName: (callback: (name: string, peerId: string) => void) => void;
  sendMuteCommand: (peerId: string) => void;
  onMuteCommand: (callback: (targetId: string, peerId: string) => void) => void;
}

export function createRoom(roomId: string): RoomSession {
  const room = joinRoom({ appId: APP_ID }, roomId);

  const [sendName, onName] = room.makeAction<string>('name');
  const [sendMuteCommand, onMuteCommand] =
    room.makeAction<string>('mute-command');

  return {
    room,
    roomId,
    sendName: (name: string) => sendName(name),
    onName,
    sendMuteCommand: (peerId: string) => sendMuteCommand(peerId),
    onMuteCommand,
  };
}

export function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function getInviteLink(roomId: string): string {
  return `https://link7373.github.io/podcast-recorder-guest/#${roomId}`;
}
