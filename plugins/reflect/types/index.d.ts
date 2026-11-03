export type Pending = string | null

declare module 'claude-code' {
  interface PluginState {
    reflect: { pending: Pending }
  }
}
