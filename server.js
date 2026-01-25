const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execPromise = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Temp directory for files
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Clean old temp files (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  fs.readdirSync(TEMP_DIR).forEach(file => {
    const filePath = path.join(TEMP_DIR, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > 5 * 60 * 1000) {
      fs.unlinkSync(filePath);
    }
  });
}, 60000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Prometheus Obfuscator API is running' });
});

// Obfuscate endpoint
app.post('/api/obfuscate', async (req, res) => {
  const { code, preset = 'Strong' } = req.body;

  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'No code provided' });
  }

  const validPresets = ['Weak', 'Medium', 'Strong', 'Vm'];
  if (!validPresets.includes(preset)) {
    return res.status(400).json({ error: 'Invalid preset' });
  }

  const timestamp = Date.now();
  const inputFile = path.join(TEMP_DIR, `input_${timestamp}.lua`);
  const outputFile = inputFile.replace('.lua', '.obfuscated.lua');

  try {
    // Write input code to temp file
    fs.writeFileSync(inputFile, code, 'utf8');

    // Run obfuscator
    const command = `luajit cli.lua --preset ${preset} ${inputFile}`;
    console.log(`Executing: ${command}`);
    
    const { stdout, stderr } = await execPromise(command, {
      cwd: __dirname,
      timeout: 30000 // 30 second timeout
    });

    if (stderr) {
      console.error('Obfuscation stderr:', stderr);
    }

    // Read obfuscated output - try multiple possible output file patterns
    let obfuscatedCode;
    const possibleOutputs = [
      outputFile,
      inputFile.replace('.lua', '.obfuscated.lua'),
      inputFile.replace('.lua', '_obfuscated.lua'),
      path.join(TEMP_DIR, 'output.lua'),
    ];

    let foundFile = null;
    for (const possibleFile of possibleOutputs) {
      if (fs.existsSync(possibleFile)) {
        foundFile = possibleFile;
        break;
      }
    }

    if (!foundFile) {
      // Log available files for debugging
      const files = fs.readdirSync(TEMP_DIR);
      console.error('Output file not found. Files in temp dir:', files);
      throw new Error('Obfuscated file was not created');
    }

    obfuscatedCode = fs.readFileSync(foundFile, 'utf8');

    // Clean up temp files
    try {
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (foundFile && fs.existsSync(foundFile)) fs.unlinkSync(foundFile);
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    res.json({ 
      success: true, 
      obfuscatedCode,
      preset 
    });

  } catch (error) {
    console.error('Obfuscation error:', error);
    
    // Clean up on error
    try {
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }

    res.status(500).json({ 
      error: 'Obfuscation failed', 
      message: error.message 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Prometheus Obfuscator API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});
