// test-fcm.js
import { sendPushNotification } from "./src/utils/firebase.js";

await sendPushNotification({
    title: "Test alert",
    body:  "Firebase is connected correctly",
    data:  { alertType: "TEST", rawPlate: "DL3CAF0001" },
});

console.log("Done");