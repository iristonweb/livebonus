export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setAuthFailureHandler,
  setAuthTokenGetter,
  setBaseUrl,
} from "./custom-fetch";
export type { AuthFailureHandler, AuthTokenGetter } from "./custom-fetch";
