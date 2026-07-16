import { startDocClient } from "./start_mysubscription";

// Separated from `start_mysubscription` so that we can exclude it in tests assets
startDocClient();
