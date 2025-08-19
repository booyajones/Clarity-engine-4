/**
 * Pipeline API Routes
 * 
 * Provides endpoints for modular pipeline execution.
 * Each module can be executed independently or as part of a full pipeline.
 */

import { Router } from 'express';
import { pipelineOrchestrator } from '../services/pipelineOrchestrator';
import { classificationModule } from '../services/modules/classificationModule';
import { finexioModule } from '../services/modules/finexioModule';
import { googleAddressModule } from '../services/modules/googleAddressModule';
import { mastercardModule } from '../services/modules/mastercardModule';
import { akkioModule } from '../services/modules/akkioModule';

const router = Router();

// Register all modules with the orchestrator
pipelineOrchestrator.registerModule(classificationModule);
pipelineOrchestrator.registerModule(finexioModule);
pipelineOrchestrator.registerModule(googleAddressModule);
pipelineOrchestrator.registerModule(mastercardModule);
pipelineOrchestrator.registerModule(akkioModule);

/**
 * Execute full pipeline for a batch
 */
router.post('/batch/:batchId/pipeline', async (req, res) => {
  try {
    const { batchId } = req.params;
    const { modules = [], options = {} } = req.body;
    
    console.log(`🚀 API: Starting full pipeline for batch ${batchId}`);
    
    // If no modules specified, run all enabled modules
    const enabledModules = modules.length > 0 ? modules : [
      'classification',
      'finexio', 
      'googleAddress',
      'mastercard',
      'akkio'
    ];
    
    // Start pipeline execution (async - don't wait)
    pipelineOrchestrator.executePipeline(
      parseInt(batchId),
      enabledModules,
      options
    ).catch(error => {
      console.error('Pipeline execution error:', error);
    });
    
    res.json({
      success: true,
      message: 'Pipeline started',
      batchId: parseInt(batchId),
      modules: enabledModules
    });
  } catch (error) {
    console.error('Error starting pipeline:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute classification module independently
 */
router.post('/batch/:batchId/classify', async (req, res) => {
  try {
    const { batchId } = req.params;
    const options = req.body;
    
    console.log(`🤖 API: Starting classification for batch ${batchId}`);
    
    // Execute classification module
    pipelineOrchestrator.executeModule(
      'classification',
      parseInt(batchId),
      options
    ).catch(error => {
      console.error('Classification execution error:', error);
    });
    
    res.json({
      success: true,
      message: 'Classification started',
      batchId: parseInt(batchId)
    });
  } catch (error) {
    console.error('Error starting classification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute Finexio matching module independently
 */
router.post('/batch/:batchId/finexio', async (req, res) => {
  try {
    const { batchId } = req.params;
    const options = req.body;
    
    console.log(`💼 API: Starting Finexio matching for batch ${batchId}`);
    
    // Execute Finexio module
    pipelineOrchestrator.executeModule(
      'finexio',
      parseInt(batchId),
      options
    ).catch(error => {
      console.error('Finexio execution error:', error);
    });
    
    res.json({
      success: true,
      message: 'Finexio matching started',
      batchId: parseInt(batchId)
    });
  } catch (error) {
    console.error('Error starting Finexio matching:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute Google Address validation module independently
 */
router.post('/batch/:batchId/address-validation', async (req, res) => {
  try {
    const { batchId } = req.params;
    const options = req.body;
    
    console.log(`📍 API: Starting address validation for batch ${batchId}`);
    
    // Execute Google Address module
    pipelineOrchestrator.executeModule(
      'googleAddress',
      parseInt(batchId),
      options
    ).catch(error => {
      console.error('Address validation execution error:', error);
    });
    
    res.json({
      success: true,
      message: 'Address validation started',
      batchId: parseInt(batchId)
    });
  } catch (error) {
    console.error('Error starting address validation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute Mastercard enrichment module independently
 */
router.post('/batch/:batchId/mastercard', async (req, res) => {
  try {
    const { batchId } = req.params;
    const options = req.body;
    
    console.log(`💳 API: Starting Mastercard enrichment for batch ${batchId}`);
    
    // Execute Mastercard module
    pipelineOrchestrator.executeModule(
      'mastercard',
      parseInt(batchId),
      options
    ).catch(error => {
      console.error('Mastercard execution error:', error);
    });
    
    res.json({
      success: true,
      message: 'Mastercard enrichment started',
      batchId: parseInt(batchId)
    });
  } catch (error) {
    console.error('Error starting Mastercard enrichment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute Akkio predictions module independently
 */
router.post('/batch/:batchId/akkio', async (req, res) => {
  try {
    const { batchId } = req.params;
    const options = req.body;
    
    console.log(`🤖 API: Starting Akkio predictions for batch ${batchId}`);
    
    // Execute Akkio module
    pipelineOrchestrator.executeModule(
      'akkio',
      parseInt(batchId),
      options
    ).catch(error => {
      console.error('Akkio execution error:', error);
    });
    
    res.json({
      success: true,
      message: 'Akkio predictions started',
      batchId: parseInt(batchId)
    });
  } catch (error) {
    console.error('Error starting Akkio predictions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get pipeline status for a batch
 */
router.get('/batch/:batchId/status', async (req, res) => {
  try {
    const { batchId } = req.params;
    
    const status = await pipelineOrchestrator.getPipelineStatus(parseInt(batchId));
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting pipeline status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Abort a running pipeline
 */
router.post('/batch/:batchId/abort', async (req, res) => {
  try {
    const { batchId } = req.params;
    
    const aborted = pipelineOrchestrator.abortPipeline(parseInt(batchId));
    
    res.json({
      success: true,
      message: aborted ? 'Pipeline aborted' : 'No running pipeline found',
      batchId: parseInt(batchId)
    });
  } catch (error) {
    console.error('Error aborting pipeline:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;