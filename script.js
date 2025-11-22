/***********************
 *  FIREBASE SETUP
 ***********************/
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/***********************
 *  SIMPLE SPA NAVIGATION
 ***********************/
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.remove("active");
  });
  document.getElementById("screen-" + name).classList.add("active");
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    showScreen(btn.getAttribute("data-screen"));
  });
});

/***********************
 *  USER ONBOARDING
 ***********************/
const userState = {
  name: "",
  age: "",
  location: "",
  bio: ""
};

function handleOnboarding(e) {
  e.preventDefault();
  userState.name = document.getElementById("name").value;
  userState.age = document.getElementById("age").value;
  userState.location = document.getElementById("location").value;
  userState.bio = document.getElementById("bio").value;

  updateProfileUI();
  showScreen("profile");
}

function updateProfileUI() {
  document.getElementById("profile-name").textContent = userState.name;
  document.getElementById("profile-meta").textContent =
    `${userState.age} • ${userState.location}`;
  document.getElementById("profile-bio").textContent = userState.bio;
}

/***********************
 *  DEMO FEED
 ***********************/
const demoMatches = [
  { name: "Ava, 29", line: "I want someone obsessed with me." },
  { name: "Mia, 31", line: "Golf, whiskey, and sarcasm." },
  { name: "Ella, 27", line: "Will roast your playlist." },
  { name: "Chloe, 30", line: "Golden retriever energy only." }
];

let demoIndex = 0;

function renderDemoMatch() {
  const m = demoMatches[demoIndex % demoMatches.length];
  document.getElementById("feed-name").textContent = m.name;
  document.querySelector("#feed-card p").textContent = m.line;
}

function nextDemoMatch() {
  demoIndex++;
  renderDemoMatch();
}

function likeDemoMatch() {
  alert("You marked this match as HOT 🔥");
  nextDemoMatch();
}

renderDemoMatch();

/***********************
 *  CHAT
 ***********************/
function sendChat() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;

  const box = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "msg msg-me";
  div.textContent = text;
  box.appendChild(div);

  box.scrollTop = box.scrollHeight;
  input.value = "";
}

/***********************
 *  WEBRTC VIDEO CHAT
 ***********************/
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let roomId = null;

const servers = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
};

async function startLocalStreamIfNeeded() {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  document.getElementById("localVideo").srcObject = localStream;
  return localStream;
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(servers);

  remoteStream = new MediaStream();
  document.getElementById("remoteVideo").srcObject = remoteStream;

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
  };
}

/***********************
 *  CREATE ROOM
 ***********************/
async function createRoom() {
  await startLocalStreamIfNeeded();

  roomId = Math.floor(100000 + Math.random() * 900000).toString();
  document.getElementById("roomIdInput").value = roomId;

  createPeerConnection();

  const roomRef = db.ref("rooms/" + roomId);
  const callerCandidates = roomRef.child("callerCandidates");

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      callerCandidates.push(event.candidate.toJSON());
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  await roomRef.set({
    offer: {
      type: offer.type,
      sdp: offer.sdp
    }
  });

  roomRef.child("answer").on("value", async (snapshot) => {
    const answer = snapshot.val();
    if (!answer) return;
    if (!peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(answer);
    }
  });

  roomRef.child("calleeCandidates").on("child_added", (snapshot) => {
    peerConnection.addIceCandidate(snapshot.val());
  });

  document.getElementById("video-status").textContent =
    "Room created: " + roomId + ". Share this ID with your match.";
}

/***********************
 *  JOIN ROOM
 ***********************/
async function joinRoom() {
  await startLocalStreamIfNeeded();

  roomId = document.getElementById("roomIdInput").value;
  const roomRef = db.ref("rooms/" + roomId);

  createPeerConnection();

  const calleeCandidates = roomRef.child("calleeCandidates");

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      calleeCandidates.push(event.candidate.toJSON());
    }
  };

  const roomSnapshot = await roomRef.get();
  const offer = roomSnapshot.val().offer;
  await peerConnection.setRemoteDescription(offer);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  await roomRef.child("answer").set({
    type: answer.type,
    sdp: answer.sdp
  });

  roomRef.child("callerCandidates").on("child_added", (snapshot) => {
    peerConnection.addIceCandidate(snapshot.val());
  });

  document.getElementById("video-status").textContent =
    "Joining room: " + roomId + "…";
}

/***********************
 *  END CALL
 ***********************/
async function hangUp() {
  if (peerConnection) peerConnection.close();
  peerConnection = null;

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  document.getElementById("localVideo").srcObject = null;
  document.getElementById("remoteVideo").srcObject = null;

  if (roomId) {
    db.ref("rooms/" + roomId).remove();
  }

  document.getElementById("video-status").textContent = "Call ended.";
}
