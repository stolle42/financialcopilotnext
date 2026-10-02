import { Component, type ReactNode } from "react";
import { FailureScreen } from "./FailureScreen";

/**
 * Shows `unexpected-error` instead of the shell when rendering throws (R-15). React itself logs
 * the error and its component stack to the console.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <FailureScreen code="unexpected-error" /> : this.props.children;
  }
}
