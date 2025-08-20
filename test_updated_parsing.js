const fs = require('fs');
const path = require('path');

// Mock logger for testing
const mockLogger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`)
};

// Simulate the updated methods from geminiAdapter.ts
class TestGeminiAdapter {
  constructor() {
    this.logger = mockLogger;
  }

  cleanGeminiOutput(content) {
    // Remove common CLI noise and formatting
    return content
      // Remove dotenv messages that appear at the beginning
      .replace(/^\[dotenv@[^\]]+\]\s+injecting\s+env\s+\([^)]+\)\s+from\s+\.env\s*/gm, '')
      // Remove other dotenv-related messages
      .replace(/^\[dotenv[^\]]*\][^\n]*\n?/gm, '')
      // Remove ```json markers
      .replace(/^\s*```json\s*/gm, '')
      // Remove closing ``` markers
      .replace(/\s*```\s*$/gm, '')
      // Remove any other ``` markers
      .replace(/^\s*```\s*/gm, '')
      // Remove intro text
      .replace(/^\s*Here's the review.*$/gm, '')
      // Remove analysis text
      .replace(/^\s*Based on.*$/gm, '')
      // Remove any leading/trailing whitespace
      .trim();
  }

  parseJsonWithFallback(jsonStr) {
    try {
      // First attempt: try to parse as-is
      const parsed = JSON.parse(jsonStr);
      return { success: true, data: parsed };
    } catch (error) {
      const errorMessage = error.message;
      
      // Try to fix common JSON escaping issues
      try {
        const fixedJsonStr = this.fixJsonEscaping(jsonStr);
        const parsed = JSON.parse(fixedJsonStr);
        return { success: true, data: parsed };
      } catch (fixError) {
        // If it's an "Unterminated string" or similar error, the JSON might be truncated
        if (errorMessage.includes('Unterminated string') || 
            errorMessage.includes('Unexpected end of JSON input') ||
            errorMessage.includes('Expected property name')) {
          return { success: false, error: `Incomplete JSON response: ${errorMessage}` };
        }
        
        return { success: false, error: errorMessage };
      }
    }
  }

  extractPartialFindings(jsonStr) {
    const findings = [];
    
    try {
      // Look for complete finding objects in the incomplete JSON
      // Use regex to find individual finding objects that are complete
      const findingPattern = /\{\s*"file":\s*"([^"]+)"[^}]*"line":\s*(\d+)[^}]*"severity":\s*"(error|warning|info)"[^}]*"message":\s*"([^"]+)"[^}]*\}/g;
      
      let match;
      while ((match = findingPattern.exec(jsonStr)) !== null) {
        const [, file, lineStr, severity, message] = match;
        
        // Try to extract additional fields from the full match
        const fullMatch = match[0];
        const endLineMatch = fullMatch.match(/"endLine":\s*(\d+)/);
        const suggestionMatch = fullMatch.match(/"suggestion":\s*"([^"]+)"/);
        const ruleIdMatch = fullMatch.match(/"ruleId":\s*"([^"]+)"/);
        const categoryMatch = fullMatch.match(/"category":\s*"([^"]+)"/);
        
        const finding = {
          file,
          line: parseInt(lineStr, 10),
          severity: severity,
          message
        };
        
        if (endLineMatch) {
          finding.endLine = parseInt(endLineMatch[1], 10);
        }
        
        if (suggestionMatch) {
          finding.suggestion = suggestionMatch[1];
        }
        
        if (ruleIdMatch) {
          finding.ruleId = ruleIdMatch[1];
        }
        
        if (categoryMatch) {
          finding.category = categoryMatch[1];
        }
        
        findings.push(finding);
      }
      
      this.logger.debug(`Extracted ${findings.length} partial findings from incomplete JSON`);
    } catch (error) {
      this.logger.warn(`Failed to extract partial findings: ${error.message}`);
    }
    
    return findings;
  }

  fixJsonEscaping(jsonStr) {
    // Fix common JSON escaping issues in Gemini responses
    let fixed = jsonStr;
    
    try {
      // First attempt: try to parse as-is
      JSON.parse(fixed);
      return fixed;
    } catch (error) {
      // If parsing fails, try a more aggressive approach
      // Parse the JSON structure manually and fix string values
      
      // Find all string values that contain unescaped quotes
      // This regex finds: "key": "value with potential issues"
      fixed = fixed.replace(/"(\w+)":\s*"((?:[^"\\]|\\.)*)"(?=\s*[,}])/g, (match, key, value) => {
        // Skip if the value is already properly escaped
        try {
          JSON.parse(`{"${key}": "${value}"}`);
          return match; // Already valid, don't change
        } catch {
          // Fix the value by properly escaping it
          const escapedValue = value
            .replace(/\\/g, '\\\\') // Escape backslashes first
            .replace(/"/g, '\\"') // Escape quotes
            .replace(/\n/g, '\\n') // Escape newlines
            .replace(/\r/g, '\\r') // Escape carriage returns
            .replace(/\t/g, '\\t') // Escape tabs
            .replace(/\f/g, '\\f') // Escape form feeds
            .replace(/\b/g, '\\b'); // Escape backspaces
          
          return `"${key}": "${escapedValue}"`;
        }
      });
      
      return fixed;
    }
  }

  parseReviewResponse(content) {
    try {
      // Clean the content first - remove dotenv messages and other noise
      const cleanedContent = this.cleanGeminiOutput(content);
      
      console.log('=== CLEANED CONTENT ===');
      console.log(cleanedContent.substring(0, 500) + '...');
      console.log('========================');
      
      // Extract JSON from the cleaned content
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const jsonStr = jsonMatch[0];
      
      // Try to parse with fallback handling
      const parseResult = this.parseJsonWithFallback(jsonStr);
      
      if (parseResult.success && parseResult.data) {
        const parsed = parseResult.data;
        
        // Validate the structure
        if (!parsed.findings || !Array.isArray(parsed.findings)) {
          throw new Error('Invalid response structure: missing findings array');
        }
        
        return {
          findings: parsed.findings,
          summary: parsed.summary || 'No summary provided'
        };
      } else {
        // JSON parsing failed, try to extract partial findings
        this.logger.warn(`JSON parsing failed: ${parseResult.error}. Attempting to extract partial findings.`);
        
        const partialFindings = this.extractPartialFindings(jsonStr);
        
        if (partialFindings.length > 0) {
          this.logger.info(`Successfully extracted ${partialFindings.length} findings from incomplete response`);
          return {
            findings: partialFindings,
            summary: 'Partial review completed (response was incomplete)'
          };
        } else {
          throw new Error(`Failed to parse review response: ${parseResult.error}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to parse Gemini response:', error);
      throw new Error(`Failed to parse review response: ${error.message}`);
    }
  }
}

// Test the updated parsing logic
const testFile = '/Users/caglar/Desktop/ado-review/logs/responses/gemini-response-pr-req-1755626107917-lstjt3kyv-2025-08-19T17-56-07-813Z.json';

try {
  console.log('Testing updated JSON parsing logic...');
  
  const rawContent = fs.readFileSync(testFile, 'utf8');
  const jsonData = JSON.parse(rawContent);
  const content = jsonData.content;
  
  console.log('\n=== ORIGINAL CONTENT (first 500 chars) ===');
  console.log(content.substring(0, 500) + '...');
  
  const adapter = new TestGeminiAdapter();
  const result = adapter.parseReviewResponse(content);
  
  console.log('\n=== PARSING RESULT ===');
  console.log(`Successfully parsed! Found ${result.findings.length} findings`);
  console.log(`Summary: ${result.summary}`);
  
  if (result.findings.length > 0) {
    console.log('\n=== SAMPLE FINDINGS ===');
    result.findings.slice(0, 3).forEach((finding, index) => {
      console.log(`${index + 1}. ${finding.file}:${finding.line} - ${finding.severity}: ${finding.message}`);
    });
  }
  
} catch (error) {
  console.error('Test failed:', error.message);
  console.error('Stack:', error.stack);
}