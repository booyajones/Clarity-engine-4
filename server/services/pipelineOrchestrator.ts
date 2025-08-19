/**
 * Pipeline Orchestrator Service
 * 
 * This service coordinates the independent processing modules in a loosely-coupled way.
 * Each module (Classification, Finexio, Google Address, Mastercard, Akkio) operates
 * independently and can be called separately or as part of a pipeline.
 * 
 * Architecture:
 * - Each module is self-contained with its own API endpoints
 * - Modules communicate via database state updates
 * - Orchestrator manages the pipeline flow but modules can run independently
 * - New modules can be easily added without modifying existing ones
 */

import { storage } from '../storage';
import { type UploadBatch } from '@shared/schema';

export interface PipelineModule {
  name: string;
  enabled: boolean;
  order: number;
  statusField: string;
  completedField: string;
  execute: (batchId: number, options?: any) => Promise<void>;
}

export class PipelineOrchestrator {
  private modules: Map<string, PipelineModule> = new Map();
  private runningPipelines: Map<number, AbortController> = new Map();

  /**
   * Register a processing module with the orchestrator
   */
  registerModule(module: PipelineModule) {
    console.log(`📦 Registering module: ${module.name} (order: ${module.order})`);
    this.modules.set(module.name, module);
  }

  /**
   * Get all registered modules sorted by execution order
   */
  getModulesByOrder(): PipelineModule[] {
    return Array.from(this.modules.values())
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Execute the full pipeline for a batch
   */
  async executePipeline(
    batchId: number,
    enabledModules: string[] = [],
    options: any = {}
  ): Promise<void> {
    console.log(`🚀 Starting pipeline for batch ${batchId}`);
    console.log(`   Enabled modules: ${enabledModules.join(', ')}`);
    
    const abortController = new AbortController();
    this.runningPipelines.set(batchId, abortController);

    try {
      // Get batch info
      const batch = await storage.getUploadBatch(batchId);
      if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
      }

      // Execute modules in order
      const sortedModules = this.getModulesByOrder();
      
      for (const module of sortedModules) {
        if (abortController.signal.aborted) {
          console.log(`⛔ Pipeline aborted for batch ${batchId}`);
          break;
        }

        // Check if module is enabled for this pipeline run
        if (enabledModules.length > 0 && !enabledModules.includes(module.name)) {
          console.log(`⏭️ Skipping disabled module: ${module.name}`);
          
          // Mark module as skipped in database
          await this.markModuleSkipped(batchId, module);
          continue;
        }

        // Check if module is globally enabled
        if (!module.enabled) {
          console.log(`⏭️ Module ${module.name} is globally disabled`);
          await this.markModuleSkipped(batchId, module);
          continue;
        }

        console.log(`▶️ Executing module: ${module.name}`);
        
        try {
          // Update status to processing
          await this.updateModuleStatus(batchId, module, 'processing');
          
          // Execute the module
          await module.execute(batchId, options[module.name] || {});
          
          // Update status to completed
          await this.updateModuleStatus(batchId, module, 'completed');
          
          console.log(`✅ Module ${module.name} completed successfully`);
        } catch (error) {
          console.error(`❌ Module ${module.name} failed:`, error);
          
          // Update status to error
          await this.updateModuleStatus(batchId, module, 'error');
          
          // Decide whether to continue or abort pipeline
          if (this.isCriticalModule(module.name)) {
            throw error; // Abort pipeline for critical modules
          }
          // Continue with next module for non-critical failures
        }
      }

      // Mark overall batch as completed
      await storage.updateUploadBatch(batchId, {
        status: 'completed',
        completedAt: new Date(),
        currentStep: 'Pipeline completed',
        progressMessage: 'All processing stages completed successfully'
      });

      console.log(`✨ Pipeline completed for batch ${batchId}`);
    } catch (error) {
      console.error(`Pipeline failed for batch ${batchId}:`, error);
      
      await storage.updateUploadBatch(batchId, {
        status: 'error',
        currentStep: 'Pipeline failed',
        progressMessage: `Pipeline error: ${error.message}`
      });
      
      throw error;
    } finally {
      this.runningPipelines.delete(batchId);
    }
  }

  /**
   * Execute a single module independently
   */
  async executeModule(
    moduleName: string,
    batchId: number,
    options: any = {}
  ): Promise<void> {
    const module = this.modules.get(moduleName);
    if (!module) {
      throw new Error(`Module ${moduleName} not found`);
    }

    console.log(`🎯 Executing single module: ${moduleName} for batch ${batchId}`);
    
    try {
      await this.updateModuleStatus(batchId, module, 'processing');
      await module.execute(batchId, options);
      await this.updateModuleStatus(batchId, module, 'completed');
      
      console.log(`✅ Module ${moduleName} completed independently`);
    } catch (error) {
      console.error(`❌ Module ${moduleName} failed:`, error);
      await this.updateModuleStatus(batchId, module, 'error');
      throw error;
    }
  }

  /**
   * Abort a running pipeline
   */
  abortPipeline(batchId: number): boolean {
    const controller = this.runningPipelines.get(batchId);
    if (controller) {
      controller.abort();
      this.runningPipelines.delete(batchId);
      console.log(`🛑 Pipeline aborted for batch ${batchId}`);
      return true;
    }
    return false;
  }

  /**
   * Check if a module is critical (pipeline should abort if it fails)
   */
  private isCriticalModule(moduleName: string): boolean {
    // Classification is critical - without it, other modules can't work
    return moduleName === 'classification';
  }

  /**
   * Update module status in the database
   */
  private async updateModuleStatus(
    batchId: number,
    module: PipelineModule,
    status: 'processing' | 'completed' | 'error' | 'skipped'
  ): Promise<void> {
    const updates: any = {};
    
    // Update status field
    if (module.statusField) {
      updates[module.statusField] = status;
    }
    
    // Update completed timestamp if completed or skipped
    if (module.completedField && (status === 'completed' || status === 'skipped')) {
      updates[module.completedField] = new Date();
    }
    
    // Add progress message
    if (status === 'processing') {
      updates.currentStep = `Processing ${module.name}`;
      updates.progressMessage = `Running ${module.name} module...`;
    }
    
    await storage.updateUploadBatch(batchId, updates);
  }

  /**
   * Mark a module as skipped
   */
  private async markModuleSkipped(
    batchId: number,
    module: PipelineModule
  ): Promise<void> {
    await this.updateModuleStatus(batchId, module, 'skipped');
  }

  /**
   * Get pipeline status for a batch
   */
  async getPipelineStatus(batchId: number): Promise<{
    batchId: number;
    modules: Array<{
      name: string;
      status: string;
      completedAt?: Date;
    }>;
    overallStatus: string;
  }> {
    const batch = await storage.getUploadBatch(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const moduleStatuses = [];
    
    for (const [name, module] of this.modules) {
      const status = batch[module.statusField as keyof UploadBatch] || 'pending';
      const completedAt = batch[module.completedField as keyof UploadBatch];
      
      moduleStatuses.push({
        name,
        status: status as string,
        completedAt: completedAt as Date | undefined
      });
    }

    return {
      batchId,
      modules: moduleStatuses,
      overallStatus: batch.status
    };
  }
}

// Create singleton instance
export const pipelineOrchestrator = new PipelineOrchestrator();