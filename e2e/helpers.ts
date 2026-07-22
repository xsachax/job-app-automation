import { type Page } from "@playwright/test";

// Locate the Jobs-page card (an <article>) for a specific posting by its title link.
export function jobCard(page: Page, title: string) {
  return page
    .getByRole("article")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) })
    .first();
}
