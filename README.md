# web_crawler

Yes, absolutely! **Selenium can be used with Node.js** to create a web crawler that can render heavy JavaScript pages, interact with clickable elements, and extract content. Selenium WebDriver provides bindings for Node.js, allowing you to control browsers like Chrome, Firefox, and Edge programmatically.

Below, I'll guide you through:

1. **Setting up a Node.js project with Selenium WebDriver.**
2. **Using Selenium to load web pages and extract content.**
3. **Finding all clickable elements and URLs.**
4. **Following links and interacting with clickable elements.**
5. **Ensuring the solution works on Windows, Unix/Linux, and macOS.**

---

## **1. Setting Up the Node.js Project with Selenium WebDriver**

### **Prerequisites**

- **Node.js**: Ensure you have Node.js (version 14 or higher) installed on your system.
  - Download from [Node.js official website](https://nodejs.org/).

### **Step 1: Create the Project Directory**

```bash
# Create a project directory
mkdir web-crawler-project
cd web-crawler-project
```

### **Step 2: Initialize the Node.js Project**

```bash
npm init -y
```

This command creates a `package.json` file with default settings.

### **Step 3: Install Dependencies**

We'll install **Selenium WebDriver** and **SQLite3** for data storage.

```bash
npm install selenium-webdriver sqlite3
```

- **`selenium-webdriver`**: The official Selenium WebDriver package for Node.js.
- **`sqlite3`**: For storing extracted data in a SQLite database.

### **Step 4: Install WebDriver Executable**

#### **ChromeDriver**

- Download **ChromeDriver** matching your Chrome version from [ChromeDriver Downloads](https://googlechromelabs.github.io/chrome-for-testing/).

#### **GeckoDriver (Firefox)**

- Download **GeckoDriver** from [GitHub Releases](https://github.com/mozilla/geckodriver/releases).

**Note**: Ensure the WebDriver executable is in your system's PATH, or specify its path in the script.

---

## **2. Writing the Web Crawler with Selenium**

### **Project Structure**

```
web-crawler-project/
├── package.json
├── package-lock.json
├── crawler.js
├── urls.txt
```

- **`crawler.js`**: The main script for the web crawler.
- **`urls.txt`**: A text file with seed URLs to start crawling.

### **Creating `urls.txt`**

Create a file named `urls.txt` and list your seed URLs:

```text
https://ab.211.ca/
```

### **Writing `crawler.js`**

Here's the complete code for `crawler.js`:

```javascript
// crawler.js

const fs = require('fs');
const { Builder, By, until } = require('selenium-webdriver');
const sqlite3 = require('sqlite3').verbose();
const { URL } = require('url');

// Configuration
const MAX_DEPTH = 2;

// Initialize SQLite database
const db = new sqlite3.Database('extracted_data.db');

// Create table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS extracted_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    date_extracted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Read seed URLs from urls.txt
if (!fs.existsSync('urls.txt')) {
  console.error('Error: urls.txt file not found.');
  process.exit(1);
}

const seedUrls = fs
  .readFileSync('urls.txt', 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

if (seedUrls.length === 0) {
  console.error('Error: No URLs found in urls.txt.');
  process.exit(1);
}

// Set of visited URLs to prevent revisiting
const visitedUrls = new Set();

async function crawlAndExtract(driver, url, baseDomain, depth) {
  if (depth > MAX_DEPTH || visitedUrls.has(url)) {
    return;
  }
  visitedUrls.add(url);
  console.log(`Crawling: ${url} at depth ${depth}`);

  try {
    await driver.get(url);

    // Wait for the page to load completely
    await driver.wait(until.elementLocated(By.css('body')), 10000);

    // Extract page title and content
    const title = await driver.getTitle();
    const content = await driver.getPageSource();

    // Store data in the database
    db.run(
      `INSERT INTO extracted_info (url, title, content)
       VALUES (?, ?, ?)`,
      [url, title, content]
    );

    // Find all clickable elements
    const clickableElements = await driver.findElements(
      By.xpath("//*[@onclick or @href or @role='button' or name()='button']")
    );

    for (const element of clickableElements) {
      try {
        const tagName = await element.getTagName();
        let elementUrl = null;

        if (tagName.toLowerCase() === 'a') {
          elementUrl = await element.getAttribute('href');
        } else {
          // For non-anchor elements, simulate click and check for URL change or content change
          const previousUrl = await driver.getCurrentUrl();
          const previousContent = await driver.getPageSource();

          await element.click();

          // Wait for potential navigation or content change
          await driver.sleep(2000); // Adjust as needed

          const newUrl = await driver.getCurrentUrl();
          const newContent = await driver.getPageSource();

          if (newUrl !== previousUrl) {
            elementUrl = newUrl;
            // Since URL changed, we can crawl the new URL
          } else if (newContent !== previousContent) {
            // Content changed without URL change; extract new content
            const newTitle = await driver.getTitle();
            db.run(
              `INSERT INTO extracted_info (url, title, content)
               VALUES (?, ?, ?)`,
              [newUrl, newTitle, newContent]
            );
            // Optionally, navigate back to previous state
            await driver.navigate().back();
            await driver.wait(until.elementLocated(By.css('body')), 10000);
            continue;
          } else {
            // No significant change; continue
            continue;
          }
        }

        if (elementUrl) {
          // Normalize and validate the URL
          const parsedLink = new URL(elementUrl, url);
          // Check if the link is internal
          if (parsedLink.hostname === baseDomain && !visitedUrls.has(parsedLink.href)) {
            await crawlAndExtract(driver, parsedLink.href, baseDomain, depth + 1);
          }
        }
      } catch (e) {
        console.error(`Error clicking element: ${e.message}`);
        continue;
      }
    }

    // Find all internal links and crawl them
    const links = await driver.findElements(By.css('a[href]'));
    for (const link of links) {
      const linkUrl = await link.getAttribute('href');
      if (linkUrl) {
        const parsedLink = new URL(linkUrl, url);
        if (parsedLink.hostname === baseDomain && !visitedUrls.has(parsedLink.href)) {
          await crawlAndExtract(driver, parsedLink.href, baseDomain, depth + 1);
        }
      }
    }
  } catch (e) {
    console.error(`Error processing ${url}: ${e.message}`);
  }
}

async function main() {
  // Set up Selenium WebDriver
  // Using Chrome in headless mode
  const { Options } = require('selenium-webdriver/chrome');
  const options = new Options();
  options.headless(); // Run in headless mode
  // options.addArguments('--disable-gpu'); // Uncomment if you have issues on Windows

  let driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  try {
    for (const url of seedUrls) {
      const parsedUrl = new URL(url);
      const baseDomain = parsedUrl.hostname;
      await crawlAndExtract(driver, url, baseDomain, 0);
    }
  } finally {
    await driver.quit();
    db.close();
  }
}

main();
```

### **Explanation of the Code**

- **Imports and Dependencies**:
  - `selenium-webdriver`: For controlling the browser.
  - `sqlite3`: For database operations.
  - `fs`, `URL`, etc.: For file system and URL parsing.

- **Configuration and Database Setup**:
  - **`MAX_DEPTH`**: Limits the crawling depth to avoid infinite loops.
  - Initializes the SQLite database and creates a table if it doesn't exist.

- **Reading Seed URLs**:
  - Reads URLs from `urls.txt`.

- **Crawler Logic** (`crawlAndExtract` function):
  - **Parameters**: `driver`, `url`, `baseDomain`, `depth`.
  - Checks if the URL has already been visited or if the maximum depth is reached.
  - Navigates to the URL using `driver.get(url)`.
  - Waits for the page to load using `driver.wait`.
  - Extracts the page title and content.
  - Stores the extracted data in the SQLite database.
  - **Finding Clickable Elements**:
    - Uses XPath to find elements with `onclick`, `href`, `role='button'`, or `<button>` tags.
    - Tries to click each element and checks for URL changes or content changes.
    - If the URL changes, recursively calls `crawlAndExtract` with the new URL.
    - If the content changes without a URL change, extracts and stores the new content.
  - **Following Internal Links**:
    - Finds all `<a>` tags with `href` attributes.
    - Adds internal links to the crawl queue.

- **Main Function** (`main`):
  - Sets up the Selenium WebDriver with Chrome in headless mode.
  - Iterates over seed URLs and starts the crawl.

---

## **3. Ensuring Cross-Platform Compatibility**

- **Selenium WebDriver**: Works on Windows, Unix/Linux, and macOS.
- **WebDriver Executable**: Ensure that the appropriate WebDriver (e.g., **ChromeDriver** for Chrome) is downloaded for your OS and browser version.
- **Placing WebDriver in PATH**: Make sure the WebDriver executable is in your system's PATH, or specify the path to it in the script.
- **Headless Mode**: Allows running the browser without a GUI, suitable for servers and command-line environments.

---

## **4. Running the Crawler**

### **Step 1: Install Dependencies**

Ensure you have installed the necessary packages:

```bash
npm install
```

### **Step 2: Run the Script**

```bash
node crawler.js
```

### **Monitoring the Output**

- The script will output the URLs being crawled and any errors encountered.
- Data is stored in `extracted_data.db`.

---

## **5. Considerations and Enhancements**

### **Adjusting Timeouts and Waits**

- Use **Explicit Waits** to wait for specific conditions instead of fixed timeouts.

**Example**:

```javascript
const { until } = require('selenium-webdriver');

// Wait for the page to load completely
await driver.wait(until.elementLocated(By.css('body')), 10000);
```

### **Handling Exceptions**

- Catch specific exceptions to improve robustness.

**Example**:

```javascript
const { ElementClickInterceptedError, NoSuchElementError } = require('selenium-webdriver/lib/error');

try {
  await element.click();
} catch (e) {
  if (e instanceof ElementClickInterceptedError || e instanceof NoSuchElementError) {
    console.error(`Error clicking element: ${e.message}`);
  } else {
    throw e;
  }
}
```

### **Using Different Browsers**

- To use **Firefox**, modify the driver setup:

```javascript
const { Builder } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const options = new firefox.Options();
options.headless();

let driver = await new Builder()
  .forBrowser('firefox')
  .setFirefoxOptions(options)
  .build();
```

### **Improving Clickable Element Detection**

- Refine the XPath or CSS selectors to target specific clickable elements relevant to your use case.

**Example**:

```javascript
const clickableElements = await driver.findElements(
  By.css('a[href], button, [onclick], [role="button"]')
);
```

### **Error Handling and Logging**

- Use the `winston` or `log4js` libraries for better logging.

**Example with `winston`**:

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'crawler.log' })
  ]
});

// Replace console.log and console.error with logger
logger.info(`Crawling: ${url} at depth ${depth}`);
logger.error(`Error processing ${url}: ${e.message}`);
```

### **Handling Sessions and Cookies**

- Selenium maintains sessions and cookies automatically.
- If needed, you can manage them using `driver.manage().getCookies()` and `driver.manage().addCookie()`.

---

## **6. Conclusion**

By using **Selenium with Node.js**, you've built a web crawler that:

- **Handles Heavy JavaScript Rendering**: Controls real browsers capable of rendering complex JavaScript.
- **Extracts Full Page Content**: Captures the entire HTML content after JavaScript execution.
- **Interacts with Clickable Elements**: Finds and interacts with clickable elements to uncover additional content or navigation paths.
- **Ensures Cross-Platform Compatibility**: Works across Windows, Unix/Linux, and macOS.

---

## **7. Next Steps**

- **Customize Data Extraction**: Modify the script to extract specific data from pages, such as text content, images, or structured data.
- **Enhance Error Handling**: Implement more robust exception handling and recovery mechanisms.
- **Scale Up**: For larger-scale crawling, consider using a database like MongoDB and implement multi-threading or asynchronous processing.
- **Compliance**: Ensure compliance with legal and ethical guidelines when scraping data.

---

## **8. Additional Resources**

- **Selenium WebDriver for JavaScript**: [Official Documentation](https://www.selenium.dev/selenium/docs/api/javascript/index.html)
- **Selenium WebDriver GitHub Repository**: [https://github.com/SeleniumHQ/selenium](https://github.com/SeleniumHQ/selenium)
- **SQLite3 for Node.js**: [https://www.npmjs.com/package/sqlite3](https://www.npmjs.com/package/sqlite3)

---

**Feel free to ask if you have any questions or need further assistance with specific parts of the project. I'm here to help you get your crawler up and running successfully!**