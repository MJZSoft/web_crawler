// For more information, see https://crawlee.dev/
import { PlaywrightCrawler } from 'crawlee';

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
    // Use the requestHandler to process each of the crawled pages.
    async requestHandler({ request, page, enqueueLinks, log, pushData }) {
        const title = await page.title();
        log.info(`Title of ${request.loadedUrl} is '${title}'`);

        // Extract the complete text content of the page
        const pageContent = await page.evaluate(() => document.body.innerText);

        // Save results as JSON to ./storage/datasets/default
        await pushData({ title, url: request.loadedUrl, content: pageContent });      

        // Click all clickable items (buttons, etc.) and extract their text
        const clickableElements = await page.$$('button, [role="button"], [onclick], [tabindex="0"]');
        for (const element of clickableElements) {
            try {
                if (await element.isVisible()) {
                    await element.click({ timeout: 3000 }).catch(() => log.warn('Click failed due to timeout')); // Attempt click with timeout
                    await page.waitForTimeout(1000); // Wait for potential content to load

                    // Extract text after clicking the element
                    const clickedContent = await page.evaluate(() => document.body.innerText);
                    await pushData({
                        clickedUrl: request.loadedUrl,
                        clickedElementText: await element.innerText(),
                        clickedContent,
                    });
                }
            } catch (e) {
                log.error(`Error clicking element: ${e.message}`);
            }
        }

        // Extract links from the current page
        // and add them to the crawling queue.
        await enqueueLinks();
    },
    // Comment this option to scrape the full website.
    maxRequestsPerCrawl: 20,
    // Uncomment this option to see the browser window.
    headless: false,
});

// Add first URL to the queue and start the crawl.
await crawler.run(['https://ab.211.ca/']);
