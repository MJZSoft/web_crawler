// list_clickable_items.js

const { Builder, By } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');

(async function listClickableItems() {
  // Configure Chrome options
  const options = new chrome.Options();
  options.addArguments('headless'); // Run Chrome in headless mode (optional)

  // Specify the path to your ChromeDriver executable
  const chromedriverPath = path.resolve(__dirname, 'chromedriver-win64', 'chromedriver.exe');

  // Set up ChromeDriver service with the specified path
  const service = new chrome.ServiceBuilder(chromedriverPath);

  // Build the WebDriver
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build();

  try {
    // Replace this URL with the one you want to test
    const url = 'https://ab.211.ca/';
    await driver.get(url);

    // Wait for the page to load
    await driver.sleep(2000); // Adjust as needed

    // Find all clickable elements
    const clickableElements = await driver.findElements(
      By.xpath("//*[@href or @onclick or @role='button' or name()='button' or name()='a']")
    );

    console.log(`Found ${clickableElements.length} clickable elements:`);

    for (const element of clickableElements) {
      try {
        const tagName = await element.getTagName();
        const text = await element.getText();
        let href = null;

        if (tagName.toLowerCase() === 'a' || tagName.toLowerCase() === 'link') {
          href = await element.getAttribute('href');
        }

        console.log('-----------------------------');
        console.log(`Tag Name: ${tagName}`);
        console.log(`Text: ${text}`);
        if (href) {
          console.log(`Href: ${href}`);
        }
      } catch (e) {
        console.error(`Error processing element: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
  } finally {
    // Quit the driver
    await driver.quit();
  }
})();
