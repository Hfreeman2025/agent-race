import { z } from "zod";

// Set before schemas are constructed: no eval probe or generated parser under strict CSP.
z.config({ jitless: true });
