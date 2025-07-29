// Quick demo to test configuration loading
const { ConfigurationManager } = require('./dist/config/index.js');

async function testConfig() {
  try {
    console.log('Testing configuration loading...\n');
    
    // Test with example JSON file
    const result = await ConfigurationManager.parseConfiguration({
      configFile: './test-configs/example-basic.json'
    });
    
    console.log('Loaded configuration:');
    console.log(JSON.stringify(result.config, null, 2));
    
    console.log('\nConfiguration sources:');
    console.log(result.sources);
    
    console.log('\n✅ Configuration system working correctly!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testConfig();