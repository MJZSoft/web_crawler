// crawler.js

require('dotenv').config();
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Read the ChromeDriver path from .env file
const chromedriverPath = process.env.CHROMEDRIVER_PATH;

if (!chromedriverPath) {
    console.error('Error: CHROMEDRIVER_PATH is not defined in .env file.');
    process.exit(1);
}

// Configuration
const MAX_DEPTH = 2; // Adjust as needed

// Initialize SQLite database
const db = new sqlite3.Database('crawler_data.db');

// Create tables if they do not exist
db.serialize(() => {
    // Table for visited URLs
    db.run(`
    CREATE TABLE IF NOT EXISTS visited_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE
    )
  `);

    // Table for page content
    db.run(`
    CREATE TABLE IF NOT EXISTS page_contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE,
      content TEXT,
      date_extracted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Table for clickable nodes
    db.run(`
    CREATE TABLE IF NOT EXISTS clickable_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_url TEXT,
      tag_name TEXT,
      text_content TEXT,
      href TEXT,
      onclick TEXT,
      other_attributes TEXT,
      UNIQUE (page_url, other_attributes)
    )
  `);
});

(async function crawler() {
    // Configure Chrome options
    const options = new chrome.Options();
    // options.addArguments('headless'); // Uncomment to run in headless mode

    // Set up ChromeDriver service with the specified path
    const service = new chrome.ServiceBuilder(chromedriverPath);

    let driver;
    try {
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .setChromeService(service)
            .build();
    } catch (e) {
        console.error('Failed to start the WebDriver. Please check the ChromeDriver path.');
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }

    // Read seed URLs from urls.txt
    const seedUrls = fs
        .readFileSync('urls.txt', 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (seedUrls.length === 0) {
        console.error('Error: No seed URLs specified in urls.txt.');
        process.exit(1);
    }

    // Set to keep track of visited URLs
    const visitedUrls = new Set();

    try {
        for (const url of seedUrls) {
            await crawlPage(driver, url, visitedUrls, 0);
        }
    } finally {
        await driver.quit();
        db.close();
    }
})();

async function crawlPage(driver, url, visitedUrls, depth) {
    if (visitedUrls.has(url) || depth > MAX_DEPTH) {
        return;
    }
    visitedUrls.add(url);
    console.log(`Crawling: ${url} at depth ${depth}`);

    try {
        await driver.get(url);

        // Wait for the page to load
        await driver.wait(until.elementLocated(By.css('body')), 10000);

        // Get the page content (rendered text)
        const content = await driver.executeScript('return document.body.innerText;');

        // Store the page content in the database
        db.run(
            `INSERT OR IGNORE INTO page_contents (url, content)
       VALUES (?, ?)`,
            [url, content],
            function (err) {
                if (err) {
                    console.error(`Database error for URL ${url}: ${err.message}`);
                }
            }
        );

        // Store the URL in visited_urls
        db.run(
            `INSERT OR IGNORE INTO visited_urls (url)
       VALUES (?)`,
            [url],
            function (err) {
                if (err) {
                    console.error(`Database error when inserting URL ${url}: ${err.message}`);
                }
            }
        );

        // Get clickable elements using the provided function
        const clickableElements = await listClickableItems(driver);

        console.log(`Found ${clickableElements.length} clickable elements on ${url}`);

        // Process each clickable element
        for (const elementInfo of clickableElements) {

            const { selector, tagName, textContent, href } = elementInfo;            
            
            // Generate a unique key for the clickable element
            const key = `${url}-${selector}`;
      
            // Store the clickable node in the database
            db.run(
              `INSERT OR IGNORE INTO clickable_nodes (page_url, tag_name, text_content, href, onclick, other_attributes)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [url, tagName, textContent, href, '', `selector: ${selector}`],
              function (err) {
                if (err) {
                  console.error(`Database error when inserting clickable node on ${url}: ${err.message}`);
                }
              }
            );
      
            // If the element has an href attribute, check if it's internal
            let elementUrl = href;
            if (elementUrl) {
              const isInternalLink = isSameDomain(url, elementUrl);
              if (!isInternalLink) {
                // Skip external links
                continue;
              }
            }
      
            // Try to find the element using its selector
            let element;
            try {
              element = await driver.findElement(By.css(selector));
            } catch (e) {
              console.error(`Error finding element by selector on ${url}: ${e.message}`);
              continue;
            }
      
            // Try to click the element and crawl the new page
            try {
              await driver.executeScript("arguments[0].scrollIntoView(true);", element);
      
              // Wait until the element is clickable
              await driver.wait(until.elementIsVisible(element), 5000);
              await driver.wait(until.elementIsEnabled(element), 5000);
      
              const currentUrl = await driver.getCurrentUrl();
      
              // Click the element
              await element.click();
      
              // Wait for navigation or content change
              await driver.sleep(2000); // Adjust as needed
      
              const newUrl = await driver.getCurrentUrl();
      
              if (newUrl !== currentUrl && isSameDomain(url, newUrl)) {
                await crawlPage(driver, newUrl, visitedUrls, depth + 1);
                // Navigate back to the previous page
                await driver.navigate().back();
                await driver.wait(until.urlIs(currentUrl), 5000);
              } else {
                // No navigation occurred, refresh the page to reset state
                await driver.navigate().refresh();
                await driver.wait(until.urlIs(currentUrl), 5000);
              }
            } catch (e) {
              console.error(`Error processing element on ${url}: ${e.message}`);
              // Refresh the page to reset state
              await driver.navigate().refresh();
              await driver.wait(until.urlIs(url), 5000);
              continue;
            }
            
        }

    } catch (e) {
        console.error(`Error crawling ${url}: ${e.message}`);
    }
}

async function listClickableItems(driver) {
    // Find all clickable elements within the <body> tag
    const clickableElements = await driver.findElements(
        By.xpath("//body//*[self::a or self::button or @href or @onclick or @role='button']")
    );

    const elementsInfo = [];

    for (const element of clickableElements) {
        try {
            const tagName = await element.getTagName();
            const textContent = await element.getText();
            let href = null;

            if (tagName.toLowerCase() === 'a' || tagName.toLowerCase() === 'link') {
                href = await element.getAttribute('href');
            }

            // Generate unique CSS selector using the updated function
            const selector = await driver.executeScript(
                function (el) {
                    function generateCssSelector(element) {
                        if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
                        if (element.id) {
                            return '#' + element.id;
                        } else {
                            let path = [];
                            while (element && element.nodeType === Node.ELEMENT_NODE) {
                                let selector = element.nodeName.toLowerCase();
                                if (element.className) {
                                    selector += '.' + element.className.trim().replace(/\s+/g, '.');
                                }
                                const sibling = element.parentNode ? element.parentNode.children : [];
                                if (sibling.length > 1) {
                                    const index = Array.prototype.indexOf.call(sibling, element) + 1;
                                    selector += `:nth-child(${index})`;
                                }
                                path.unshift(selector);

                                element = element.parentNode;

                                // Stop if the parent element has an id
                                if (element && element.id) {
                                    path.unshift('#' + element.id);
                                    break;
                                }
                            }
                            return path.join(' > ');
                        }
                    }
                    return generateCssSelector(el);
                },
                element
            );

            elementsInfo.push({
                selector,
                tagName,
                textContent: textContent.trim(),
                href: href || '',
            });
        } catch (e) {
            console.error(`Error processing element: ${e.message}`);
        }
    }

    return elementsInfo;
}



function isSameDomain(currentUrl, newUrl) {
    try {
        const current = new URL(currentUrl);
        const newLink = new URL(newUrl, currentUrl);
        return current.hostname === newLink.hostname;
    } catch (e) {
        return false;
    }
}
