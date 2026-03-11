export interface Tool {
    name: string;
    description: string;
    parameters: any;
    execute: (args: any) => Promise<string> | string;
}

export const toolsRegistry = new Map<string, Tool>();

export function registerTool(tool: Tool) {
    toolsRegistry.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
    return toolsRegistry.get(name);
}

export function getAllToolsDefinitions() {
    return Array.from(toolsRegistry.values()).map(tool => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        }
    }));
}
