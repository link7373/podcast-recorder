/**
 * Guest page — runs in the browser when a remote participant clicks the invite link.
 * Connects to the host's Trystero room and streams microphone audio.
 */

import { joinRoom } from 'trystero/torrent';

const APP_ID = 'podcast-recorder-v1';

const nameInput = document.getElementById('nameInput') as HTMLInputElement;
const joinBtn = document.getElementById('joinBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const avatarEl = document.getElementById('avatar') as HTMLDivElement;
const mutedEl = document.getElementById('mutedIndicator') as HTMLParagraphElement;

// Extract room ID from URL hash
const roomId = window.location.hash.slice(1);

if (!roomId) {
  statusEl.textContent = 'Invalid invite link — no room ID found';
  statusEl.className = 'status error';
} else {
  // Enable join button when name is entered
  nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim();
    joinBtn.disabled = name.length === 0;
    avatarEl.textContent = name ? name.charAt(0).toUpperCase() : '?';
  });

  joinBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) return;

    joinBtn.disabled = true;
    nameInput.disabled = true;
    statusEl.textContent = 'Requesting microphone access...';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      statusEl.textContent = 'Connecting to session...';

      const room = joinRoom({ appId: APP_ID }, roomId);
      const [sendName] = room.makeAction<string>('name');

      // When we connect to a peer (the host), send our name and audio
      room.onPeerJoin(() => {
        sendName(name);
        room.addStream(stream);
        statusEl.textContent = 'Connected! Recording may be in progress.';
        statusEl.className = 'status connected';
      });

      room.onPeerLeave(() => {
        statusEl.textContent = 'Host disconnected. You can close this tab.';
        statusEl.className = 'status';
      });

      // Listen for mute commands from host
      const [, onMuteCommand] = room.makeAction<string>('mute-command');
      onMuteCommand((peerId: string) => {
        // If the mute command targets us (or is broadcast), toggle
        if (peerId === 'all' || peerId === room.selfId) {
          const audioTrack = stream.getAudioTracks()[0];
          audioTrack.enabled = !audioTrack.enabled;
          mutedEl.classList.toggle('visible', !audioTrack.enabled);
        }
      });

      // Listen for incoming audio from other peers (so guest can hear everyone)
      room.onPeerStream((peerStream: MediaStream) => {
        const audio = new Audio();
        audio.srcObject = peerStream;
        audio.play();
      });

    } catch (err) {
      statusEl.textContent = `Microphone error: ${err instanceof Error ? err.message : String(err)}`;
      statusEl.className = 'status error';
      joinBtn.disabled = false;
      nameInput.disabled = false;
    }
  });
}
