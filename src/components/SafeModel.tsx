import React, { Suspense, Component, ReactNode } from "react";
import { Box } from "@react-three/drei";

class ErrorBoundary extends Component<{ fallback: ReactNode, children: ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.warn("Could not load model:", error);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function SafeModel({ children, fallback = <Box args={[1, 1, 1]}><meshStandardMaterial color="red" /></Box> }: { children: ReactNode, fallback?: ReactNode }) {
  return (
    <ErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
