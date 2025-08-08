import fs from 'fs';

const routesFile = fs.readFileSync('./server/routes.ts', 'utf8');

// Check if main upload route exists
if (!routesFile.includes('app.post("/api/upload"')) {
  console.log('Main upload route missing - needs to be added');
  
  // Find the location after the preview route
  const previewIndex = routesFile.indexOf('app.post("/api/upload/preview"');
  if (previewIndex > -1) {
    // Find the end of the preview route
    const afterPreview = routesFile.indexOf('});', previewIndex + 100) + 3;
    
    const uploadRoute = `
  // Main file upload route for batch processing
  app.post("/api/upload", uploadLimiter, upload.single("file"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const payeeColumn = req.body.payeeColumn || 'payee';
      const enableFinexio = req.body.enableFinexio !== 'false';
      const enableMastercard = req.body.enableMastercard !== 'false';
      
      const userId = 1; // TODO: Get from session/auth
      const batch = await storage.createUploadBatch({
        filename: generateFinancialBatchName(),
        originalFilename: req.file.originalname,
        totalRecords: 0,
        userId,
      });

      // Process file in background
      processFileAsync(req.file, batch.id, payeeColumn, {
        enableFinexio,
        enableMastercard
      });

      res.json({ 
        id: batch.id,
        status: "processing",
        message: "File uploaded successfully and processing has started"
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
`;
    
    const newRoutes = routesFile.slice(0, afterPreview) + uploadRoute + routesFile.slice(afterPreview);
    console.log('Upload route would be added at position', afterPreview);
  }
} else {
  console.log('Main upload route already exists');
}
