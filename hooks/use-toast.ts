"use client";

// Adapted from the shadcn/ui toast hook.
import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

function dispatch(next: State) {
  memoryState = next;
  listeners.forEach((l) => l(memoryState));
}

function scheduleRemove(id: string) {
  if (timeouts.has(id)) return;
  const timeout = setTimeout(() => {
    timeouts.delete(id);
    dispatch({ toasts: memoryState.toasts.filter((t) => t.id !== id) });
  }, TOAST_REMOVE_DELAY);
  timeouts.set(id, timeout);
}

export function toast(props: Omit<ToasterToast, "id">) {
  const id = genId();

  const update = (next: Partial<ToasterToast>) =>
    dispatch({
      toasts: memoryState.toasts.map((t) => (t.id === id ? { ...t, ...next } : t)),
    });
  const dismiss = () =>
    dispatch({
      toasts: memoryState.toasts.map((t) => (t.id === id ? { ...t, open: false } : t)),
    });

  dispatch({
    toasts: [
      {
        ...props,
        id,
        open: true,
        onOpenChange: (open: boolean) => {
          if (!open) {
            dismiss();
            scheduleRemove(id);
          }
        },
      },
      ...memoryState.toasts,
    ].slice(0, TOAST_LIMIT),
  });

  return { id, update, dismiss };
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (id?: string) =>
      dispatch({
        toasts: memoryState.toasts.map((t) =>
          !id || t.id === id ? { ...t, open: false } : t,
        ),
      }),
  };
}
