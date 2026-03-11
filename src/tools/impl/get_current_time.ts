import { registerTool } from "../registry.js";

registerTool({
    name: "get_current_time",
    description: "Obtiene la hora y fecha local actual del sistema.",
    parameters: {
        type: "object",
        properties: {},
        required: [],
    },
    execute: () => {
        return new Date().toLocaleString("es-ES", { timeZoneName: "short" });
    }
});
