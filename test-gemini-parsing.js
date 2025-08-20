const fs = require('fs');
const path = require('path');

// Import the GeminiAdapter class and Logger
const { GeminiAdapter } = require('./dist/core/geminiAdapter');
const { Logger } = require('./dist/core/logger');

// Test the problematic Gemini response
async function testGeminiParsing() {
  console.log('🧪 Testing Gemini JSON parsing solution...');
  
  try {
    // Read the problematic response file
    const responseFile = '/Users/caglar/Desktop/ado-review/logs/responses/gemini-response-pr-req-1755626107917-lstjt3kyv-2025-08-19T17-56-07-813Z.json';
    const responseData = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
    
    // Extract the problematic content (with dotenv messages)
    const problematicContent = responseData.content;
    
    console.log('📄 Original problematic content:');
    console.log(problematicContent.substring(0, 200) + '...');
    console.log('');
    
    // Create a Logger instance
    const logger = new Logger({ level: 'info' });
    
    // Create an ErrorHandler instance (we'll need to import this too)
    const { ErrorHandler } = require('./dist/core/errorHandler');
    const errorHandler = new ErrorHandler();
    
    // Create a GeminiAdapter instance for testing
    const adapter = new GeminiAdapter(logger, errorHandler, 30000);
    
    // Test the parseReviewResponse method directly
    console.log('🔧 Testing parseReviewResponse method...');
    const result = adapter.parseReviewResponse(problematicContent);
    
    console.log('✅ Parsing successful!');
    console.log('📊 Results:');
    console.log(`- Findings: ${result.findings.length}`);
    console.log(`- Summary: ${result.summary ? 'Present' : 'Missing'}`);
    
    if (result.findings.length > 0) {
      console.log('\n📋 First finding:');
      console.log(`  File: ${result.findings[0].file}`);
      console.log(`  Line: ${result.findings[0].line}`);
      console.log(`  Severity: ${result.findings[0].severity}`);
      console.log(`  Message: ${result.findings[0].message.substring(0, 100)}...`);
    }
    
    if (result.summary) {
      console.log('\n📝 Summary:');
      console.log(`  ${result.summary.substring(0, 150)}...`);
    }
    
    console.log('\n🎉 Gemini JSON parsing solution is working correctly!');
    return true;
    
  } catch (error) {
    console.error('❌ Parsing failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
testGeminiParsing().then(success => {
  process.exit(success ? 0 : 1);
});