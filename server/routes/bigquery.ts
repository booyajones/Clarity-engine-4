import { Router } from 'express';
import { bigQueryService } from '../services/bigQueryService';
import { payeeMatchingService } from '../services/payeeMatchingService';
import { storage } from '../storage';

const router = Router();

// Check BigQuery configuration status
router.get('/config-status', async (req, res) => {
  try {
    const isConfigured = bigQueryService.isServiceConfigured();
    
    res.json({
      isConfigured,
      message: isConfigured 
        ? 'BigQuery is configured and ready' 
        : 'BigQuery credentials not configured'
    });
  } catch (error) {
    console.error('Error checking BigQuery config:', error);
    res.status(500).json({ error: 'Failed to check BigQuery configuration' });
  }
});

// Test BigQuery connection
router.post('/test-connection', async (req, res) => {
  try {
    if (!bigQueryService.isServiceConfigured()) {
      return res.status(400).json({ 
        error: 'BigQuery not configured',
        message: 'Please provide BIGQUERY_PROJECT_ID and BIGQUERY_CREDENTIALS environment variables'
      });
    }
    
    // Try a simple query to test connection
    const testResult = await bigQueryService.searchKnownPayees('test');
    
    res.json({
      success: true,
      message: 'BigQuery connection successful',
      sampleResultCount: testResult.length
    });
  } catch (error) {
    console.error('BigQuery connection test failed:', error);
    res.status(500).json({ 
      error: 'BigQuery connection failed',
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Search known payees
router.post('/search', async (req, res) => {
  try {
    const { payeeName } = req.body;
    
    if (!payeeName) {
      return res.status(400).json({ error: 'Payee name is required' });
    }
    
    if (!bigQueryService.isServiceConfigured()) {
      return res.status(400).json({ error: 'BigQuery not configured' });
    }
    
    const results = await bigQueryService.searchKnownPayees(payeeName);
    res.json({ results });
  } catch (error) {
    console.error('Error searching payees:', error);
    res.status(500).json({ error: 'Failed to search payees' });
  }
});

// Get payee matches for a classification
router.get('/matches/:classificationId', async (req, res) => {
  try {
    const classificationId = parseInt(req.params.classificationId);
    
    if (isNaN(classificationId)) {
      return res.status(400).json({ error: 'Invalid classification ID' });
    }
    
    const matches = await storage.getClassificationMatches(classificationId);
    res.json({ matches });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// Confirm or reject a match
router.post('/matches/:matchId/confirm', async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const { isCorrect } = req.body;
    const userId = 1; // TODO: Get from session/auth
    
    if (isNaN(matchId)) {
      return res.status(400).json({ error: 'Invalid match ID' });
    }
    
    if (typeof isCorrect !== 'boolean') {
      return res.status(400).json({ error: 'isCorrect must be a boolean' });
    }
    
    await payeeMatchingService.confirmMatch(matchId, userId, isCorrect);
    
    res.json({ 
      success: true,
      message: `Match ${isCorrect ? 'confirmed' : 'rejected'} successfully`
    });
  } catch (error) {
    console.error('Error confirming match:', error);
    res.status(500).json({ error: 'Failed to confirm match' });
  }
});

// Manually trigger payee matching for a batch
router.post('/match-batch/:batchId', async (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId);
    
    if (isNaN(batchId)) {
      return res.status(400).json({ error: 'Invalid batch ID' });
    }
    
    if (!bigQueryService.isServiceConfigured()) {
      return res.status(400).json({ error: 'BigQuery not configured' });
    }
    
    // Start matching process asynchronously
    payeeMatchingService.matchBatchPayees(batchId)
      .then(result => {
        console.log(`Manual BigQuery matching completed for batch ${batchId}:`, result);
      })
      .catch(error => {
        console.error(`Manual BigQuery matching failed for batch ${batchId}:`, error);
      });
    
    res.json({ 
      success: true,
      message: 'BigQuery matching started for batch'
    });
  } catch (error) {
    console.error('Error starting batch matching:', error);
    res.status(500).json({ error: 'Failed to start batch matching' });
  }
});

// Get table schema
router.post('/test-schema', async (req, res) => {
  try {
    const { projectId, datasetId, tableId } = req.body;
    
    const schema = await bigQueryService.getTableSchema(datasetId, tableId);
    
    res.json({
      success: true,
      schema: schema
    });
  } catch (error) {
    console.error('BigQuery schema test failed:', error);
    res.status(500).json({
      error: 'BigQuery schema failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;