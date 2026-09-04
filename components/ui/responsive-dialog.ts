const PHONE_SHELL =
  'flex min-w-0 h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0'
const TABLET_SHELL =
  'sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-[calc(100%-2rem)]'

/** Near-full-screen on phone/tablet; viewport-capped centered dialog on desktop. */
export const DIALOG_SHELL_CLASS = `${PHONE_SHELL} ${TABLET_SHELL} lg:h-[90dvh] lg:max-h-[90dvh] lg:w-full lg:max-w-[54.6rem]`

/** Wider desktop cap for dense forms (daily work). */
export const DIALOG_SHELL_WIDE_CLASS = `${PHONE_SHELL} ${TABLET_SHELL} lg:h-[90dvh] lg:max-h-[90dvh] lg:w-full lg:max-w-[72.8rem]`

/** Scrollable form dialog that still fits the viewport. */
export const DIALOG_SHELL_SCROLL_CLASS =
  'flex flex-col gap-4 bg-card text-foreground max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-[calc(100%-2rem)] sm:p-6 lg:max-h-[90dvh] lg:max-w-2xl'
