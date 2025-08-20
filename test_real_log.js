const fs = require('fs');
const { GeminiAdapter } = require('./dist/core/geminiAdapter');
const { Logger } = require('./dist/core/logger');

// Read the real log file
const logContent = fs.readFileSync('/Users/caglar/Desktop/ado-review/logs/responses/gemini-response-pr-req-1755626107917-lstjt3kyv-2025-08-19T17-56-07-813Z.json', 'utf8');

console.log('Original JSON file content:');
console.log('---');
console.log(logContent.substring(0, 200) + '...');
console.log('---');

// Parse the outer JSON first
let outerJson;
try {
  outerJson = JSON.parse(logContent);
  console.log('\n✅ Outer JSON parsing successful!');
  console.log('Content field preview:', outerJson.content.substring(0, 200) + '...');
} catch (error) {
  console.log('\n❌ Outer JSON parsing failed:', error.message);
  return;
}

// Create a test instance
const logger = new Logger({ level: 'error' }); // Suppress logs during test
const adapter = new GeminiAdapter(logger);

// Test the cleanup and JSON fixing using the same logic as the adapter
const cleanGeminiOutput = function(content) {
  // Remove dotenv injection messages
  let cleaned = content.replace(/\[dotenv@[^\]]+\]\s+injecting\s+env\s+\([^)]+\)\s+from\s+[^\n]+\n?/g, '');
  
  // Remove other common CLI noise patterns
  cleaned = cleaned.replace(/^\s*Loading\s+.*\n/gm, '');
  cleaned = cleaned.replace(/^\s*Initializing\s+.*\n/gm, '');
  cleaned = cleaned.replace(/^\s*Using\s+model\s+.*\n/gm, '');
  
  // Trim whitespace and normalize line endings
  cleaned = cleaned.trim();
  
  return cleaned;
};

const fixJsonEscaping = function fixJsonEscaping(jsonStr) {
  // The issue is that there are unescaped quotes within string values
  // We need to find and fix these specific cases
  let result = jsonStr;
  
  // Look for patterns like: "text with \"unescaped quote\" more text"
  // and fix unescaped quotes within string values
  result = result.replace(/"([^"]*?)\\"([^"]*?)\\"([^"]*?)"/g, (match, before, middle, after) => {
    // This handles cases where we have escaped quotes that should stay escaped
    return match;
  });
  
  // More aggressive approach: find all string values and fix internal quotes
  result = result.replace(/"((?:[^"\\]|\\.)*)"(?=\s*[,}\]:])/g, (match, content) => {
    // Check if this string contains unescaped quotes
    if (content.includes('"') && !content.includes('\\"')) {
      // Fix unescaped quotes
      const fixed = content.replace(/"/g, '\\"');
      return `"${fixed}"`;
    }
    return match;
  });
  
  return result;
};

// Clean dotenv messages from the content field
const cleanedContent = cleanGeminiOutput(outerJson.content);

console.log('\nCleaned content from content field:');
console.log('---');
console.log(cleanedContent.substring(0, 200) + '...');
console.log('---');

// Test JSON parsing
try {
  const jsonMatch = cleanedContent.match(/```json\s*([\s\S]*?)\s*```/) || cleanedContent.match(/{[\s\S]*}/);
  if (jsonMatch) {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    console.log('\nExtracted JSON string (first 500 chars):');
    console.log('---');
    console.log(jsonStr.substring(0, 500) + '...');
    console.log('---');
    
    console.log('\nTrying to fix JSON escaping...');
    const fixedJsonStr = fixJsonEscaping(jsonStr);
    
    console.log('\nFixed JSON string (first 500 chars):');
    console.log('---');
    console.log(fixedJsonStr.substring(0, 500) + '...');
    console.log('---');
    
    console.log('\nAttempting to parse JSON...');
    const parsed = JSON.parse(fixedJsonStr);
    console.log('\n✅ JSON parsing successful!');
    console.log('Findings count:', parsed.findings?.length || 0);
    console.log('Summary length:', parsed.summary?.length || 0);
    console.log('First finding file:', parsed.findings?.[0]?.file || 'N/A');
    console.log('First finding message preview:', (parsed.findings?.[0]?.message || '').substring(0, 100) + '...');
  } else {
    console.log('\n❌ No JSON found in cleaned content');
  }
} catch (error) {
  console.log('\n❌ JSON parsing failed:', error.message);
  console.log('Error position:', error.message.match(/position (\d+)/)?.[1] || 'unknown');
  
  // Show the problematic area
   const jsonMatch = cleanedContent.match(/```json\s*([\s\S]*?)\s*```/) || cleanedContent.match(/{[\s\S]*}/);
   if (jsonMatch) {
     const jsonStr = jsonMatch[1] || jsonMatch[0];
     const fixedJsonStr = fixJsonEscaping(jsonStr);
     const errorPos = parseInt(error.message.match(/position (\d+)/)?.[1] || '0');
     const start = Math.max(0, errorPos - 200);
     const end = Math.min(fixedJsonStr.length, errorPos + 200);
     console.log('\nProblematic area around error position (wider view):');
     console.log('---');
     console.log(fixedJsonStr.substring(start, end));
     console.log('---');
     
     // Show character codes around the error position
     console.log('\nCharacter codes around error position:');
     const charStart = Math.max(0, errorPos - 10);
     const charEnd = Math.min(fixedJsonStr.length, errorPos + 10);
     for (let i = charStart; i < charEnd; i++) {
       const char = fixedJsonStr[i];
       const code = char.charCodeAt(0);
       const marker = i === errorPos ? ' <-- ERROR' : '';
       console.log(`Position ${i}: '${char}' (${code})${marker}`);
     }
   }
}

console.log('\nTest completed.');