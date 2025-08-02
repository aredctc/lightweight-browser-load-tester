import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';

/**
 * File data cache entry
 */
interface FileDataCacheEntry {
  data: string[];
  lastModified: number;
}

/**
 * Variable context for randomization
 */
export interface VariableContext {
  [key: string]: any;
}

/**
 * Randomization utility class for substituting variables and random values
 */
export class RandomizationUtil {
  private fileDataCache: Record<string, FileDataCacheEntry> = {};
  private variableContext: VariableContext;

  constructor(variableContext: VariableContext = {}) {
    this.variableContext = variableContext;
  }

  /**
   * Update the variable context
   */
  updateContext(context: VariableContext): void {
    this.variableContext = { ...this.variableContext, ...context };
  }

  /**
   * Substitute variables in template string with support for random functions
   */
  substituteVariables(template: string): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      try {
        // Handle random functions
        if (expression.startsWith('random:')) {
          return this.handleRandomFunction(expression);
        }
        
        // Handle randomFrom functions
        if (expression.startsWith('randomFrom:')) {
          return this.handleRandomFromFunction(expression);
        }
        
        // Handle randomFromFile functions
        if (expression.startsWith('randomFromFile:')) {
          return this.handleRandomFromFileFunction(expression);
        }
        
        // Handle regular variable substitution
        const value = this.variableContext[expression.trim()];
        return value !== undefined ? String(value) : match;
      } catch (error) {
        console.warn(`Failed to substitute variable: ${expression}`, error);
        return match;
      }
    });
  }

  /**
   * Handle random function calls (e.g., {{random:uuid}}, {{random:number}})
   */
  private handleRandomFunction(expression: string): string {
    const functionName = expression.substring(7); // Remove 'random:'
    
    switch (functionName) {
      case 'uuid': {
        return randomUUID();
      }
      
      case 'number': {
        return Math.floor(Math.random() * 1000000).toString();
      }
      
      case 'timestamp': {
        return Date.now().toString();
      }
      
      case 'hex': {
        return Math.floor(Math.random() * 16777215).toString(16);
      }
      
      case 'alphanumeric': {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      }
      
      default: {
        // Check if it's a range function like random:1-100
        const rangeMatch = functionName.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const min = parseInt(rangeMatch[1], 10);
          const max = parseInt(rangeMatch[2], 10);
          return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
        }
        
        console.warn(`Unknown random function: ${functionName}`);
        return expression;
      }
    }
  }

  /**
   * Handle randomFrom function calls (e.g., {{randomFrom:arrayName}})
   */
  private handleRandomFromFunction(expression: string): string {
    const arrayName = expression.substring(11); // Remove 'randomFrom:'
    const array = this.variableContext[arrayName];
    
    if (!Array.isArray(array)) {
      console.warn(`randomFrom target is not an array: ${arrayName}`, typeof array);
      return expression;
    }
    
    if (array.length === 0) {
      console.warn(`randomFrom target array is empty: ${arrayName}`);
      return expression;
    }
    
    const randomIndex = Math.floor(Math.random() * array.length);
    return String(array[randomIndex]);
  }

  /**
   * Handle randomFromFile function calls (e.g., {{randomFromFile:./data/values.txt}})
   */
  private handleRandomFromFileFunction(expression: string): string {
    const filePath = expression.substring(15); // Remove 'randomFromFile:'
    
    try {
      // Check cache first
      const cachedData = this.getCachedFileData(filePath);
      if (cachedData && cachedData.length > 0) {
        const randomIndex = Math.floor(Math.random() * cachedData.length);
        return cachedData[randomIndex];
      }
      
      console.warn(`File data is empty or could not be loaded: ${filePath}`);
      return expression;
    } catch (error) {
      console.warn(`Failed to read random data from file: ${filePath}`, error);
      return expression;
    }
  }

  /**
   * Get cached file data or load from file system
   */
  private getCachedFileData(filePath: string): string[] | null {
    try {
      // Get file stats to check if file has been modified
      const fs = require('fs');
      const stats = fs.statSync(filePath);
      const lastModified = stats.mtime.getTime();
      
      // Check if we have cached data and it's still valid
      const cached = this.fileDataCache[filePath];
      if (cached && cached.lastModified >= lastModified) {
        return cached.data;
      }
      
      // Read file and cache the data
      const fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#')); // Filter empty lines and comments
      
      this.fileDataCache[filePath] = {
        data: lines,
        lastModified
      };
      
      return lines;
    } catch (error) {
      console.warn(`Failed to load file data: ${filePath}`, error);
      return null;
    }
  }

  /**
   * Process localStorage data by substituting variables in all values
   */
  processLocalStorageData(data: Record<string, string>): Record<string, string> {
    const processedData: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(data)) {
      processedData[key] = this.substituteVariables(value);
    }
    
    return processedData;
  }
}