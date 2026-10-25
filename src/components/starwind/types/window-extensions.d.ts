/**
 * Window extensions
 *
 * Adds typed optional globals used by a few client-side components. Kept intentionally narrow (no
 * index signature) to preserve type safety.
 */

export {};

declare global {
  interface Window {
    /** Test hook used to disable effects that rely on third-party scripts (e.g., a CAPTCHA) */
    __DISABLE_TURNSTILE__?: boolean;

    /** Optional hook for triggering the matrix overlay animation */
    showMatrixAnimation?: () => void;

    /** Modal controls exposed for progressive enhancement */
    showModal?: (id: string) => void;
    hideModal?: (id: string) => void;
    toggleModal?: (id: string) => void;
  }
}
