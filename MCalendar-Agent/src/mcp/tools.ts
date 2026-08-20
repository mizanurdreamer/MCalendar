import type { ToolDefinition } from "../providers/types.js";
import { getMcpToolDefs } from "./client.js";

const EXPLORATORY_PREFIXES = [
  "browser_navigate",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_fill_form",
  "browser_hover",
  "browser_press_key",
  "browser_select_option",
  "browser_screenshot",
  "browser_tab_list",
  "browser_tab_new",
  "browser_tab_select",
  "browser_tab_close",
  "browser_close",
  "browser_wait",
  "browser_navigate_back",
  "browser_navigate_forward",
  "browser_reload",
  "browser_drag",
  "browser_file_upload",
  "browser_handle_dialog",
  "browser_resize",
  "browser_pdf_save",
  "browser_console_messages",
  "browser_network_requests",
  "browser_select_text",
  "browser_save_as",
  "browser_toggle_dark_mode",
  "browser_run_javascript",
];

export function getMcpToolDefinitions(): ToolDefinition[] {
  const allTools = getMcpToolDefs();
  return allTools
    .filter((t) => EXPLORATORY_PREFIXES.some((p) => t.name.startsWith(p)))
    .map((t) => ({
      name: t.name,
      description: t.description ?? `Browser automation: ${t.name}`,
      inputSchema: t.inputSchema as ToolDefinition["inputSchema"],
    }));
}
