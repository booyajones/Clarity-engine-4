import { Router } from 'express';
import { db } from '../db';
import { mastercardSearchRequests } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';

const router = Router();

// Get all Mastercard searches
router.get('/searches', async (req, res) => {
  try {
    const searches = await db
      .select()
      .from(mastercardSearchRequests)
      .orderBy(desc(mastercardSearchRequests.submittedAt))
      .limit(100);
    
    res.json(searches);
  } catch (error) {
    console.error('Error fetching Mastercard searches:', error);
    res.status(500).json({ error: 'Failed to fetch searches' });
  }
});

// Get search statistics
router.get('/searches/stats', async (req, res) => {
  try {
    // Get all searches for statistics
    const searches = await db
      .select()
      .from(mastercardSearchRequests)
      .orderBy(desc(mastercardSearchRequests.submittedAt))
      .limit(1000);
    
    // Calculate stats
    const stats = {
      total: searches.length,
      pending: searches.filter(s => s.status === 'pending').length,
      submitted: searches.filter(s => s.status === 'submitted').length,
      polling: searches.filter(s => s.status === 'polling').length,
      completed: searches.filter(s => s.status === 'completed').length,
      failed: searches.filter(s => s.status === 'failed').length,
      cancelled: searches.filter(s => s.status === 'cancelled').length,
      timeout: searches.filter(s => s.status === 'timeout').length
    };
    
    res.json({
      stats,
      searches: searches.slice(0, 10) // Return top 10 most recent searches
    });
  } catch (error) {
    console.error('Error fetching Mastercard search stats:', error);
    res.status(500).json({ error: 'Failed to fetch search statistics' });
  }
});

// Delete a Mastercard search
router.delete('/searches/:id', async (req, res) => {
  try {
    const searchId = parseInt(req.params.id);
    
    if (isNaN(searchId)) {
      return res.status(400).json({ error: 'Invalid search ID' });
    }

    // Delete the search record
    const result = await db
      .delete(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.id, searchId));

    res.json({ success: true, message: 'Search deleted successfully' });
  } catch (error) {
    console.error('Error deleting Mastercard search:', error);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

// Retry a failed Mastercard search
router.post('/retry', async (req, res) => {
  try {
    const { searchId } = req.body;
    
    if (!searchId) {
      return res.status(400).json({ error: 'Search ID is required' });
    }

    // Get the existing search request
    const [existingSearch] = await db
      .select()
      .from(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.id, searchId))
      .limit(1);

    if (!existingSearch) {
      return res.status(404).json({ error: 'Search not found' });
    }

    // Only retry failed or timeout searches
    if (!['failed', 'timeout'].includes(existingSearch.status)) {
      return res.status(400).json({ 
        error: 'Can only retry failed or timed out searches',
        currentStatus: existingSearch.status 
      });
    }

    // Create a new search request based on the failed one
    const { mastercardApi } = await import('../services/mastercardApi');
    
    // Parse the request payload
    const requestPayload = existingSearch.requestPayload as any;
    
    // Submit a new search with the same parameters
    const searchRequest = {
      lookupType: 'SUPPLIERS' as const,
      maximumMatches: 1,
      minimumConfidenceThreshold: '0.3',
      searches: [{
        searchRequestId: `retry${Date.now()}${Math.random().toString(36).substring(2, 8)}`.replace(/[^a-zA-Z0-9]/g, '').substring(0, 64),
        businessName: requestPayload?.payeeName || '',
        businessAddress: requestPayload?.address ? {
          addressLine1: requestPayload.address,
          country: 'USA'
        } : { country: 'USA' }
      }]
    };

    const response = await mastercardApi.submitBulkSearch(searchRequest);
    
    // Create a new search record
    const [newSearch] = await db
      .insert(mastercardSearchRequests)
      .values({
        searchId: response.bulkSearchId,
        status: 'submitted',
        searchType: existingSearch.searchType,
        requestPayload: existingSearch.requestPayload,
        pollAttempts: 0,
        maxPollAttempts: 30,
        submittedAt: new Date(),
        payeeClassificationId: existingSearch.payeeClassificationId,
        batchId: existingSearch.batchId
      })
      .returning();

    res.json({ 
      success: true, 
      message: 'Search retry initiated',
      newSearchId: newSearch.searchId,
      searchRecordId: newSearch.id
    });
  } catch (error) {
    console.error('Error retrying Mastercard search:', error);
    res.status(500).json({ error: 'Failed to retry search' });
  }
});

// Cancel an active search
router.post('/searches/:id/cancel', async (req, res) => {
  try {
    const searchId = parseInt(req.params.id);
    
    if (isNaN(searchId)) {
      return res.status(400).json({ error: 'Invalid search ID' });
    }

    // Get the existing search
    const [existingSearch] = await db
      .select()
      .from(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.id, searchId))
      .limit(1);

    if (!existingSearch) {
      return res.status(404).json({ error: 'Search not found' });
    }

    // Only cancel active searches (pending, submitted, polling)
    if (!['pending', 'submitted', 'polling'].includes(existingSearch.status)) {
      return res.status(400).json({ 
        error: 'Can only cancel active searches',
        currentStatus: existingSearch.status 
      });
    }

    // Update the search status to cancelled
    await db
      .update(mastercardSearchRequests)
      .set({ 
        status: 'cancelled',
        completedAt: new Date(),
        error: 'Search cancelled by user'
      })
      .where(eq(mastercardSearchRequests.id, searchId));

    res.json({ 
      success: true, 
      message: 'Search cancelled successfully',
      searchId: existingSearch.searchId
    });
  } catch (error) {
    console.error('Error cancelling Mastercard search:', error);
    res.status(500).json({ error: 'Failed to cancel search' });
  }
});

// Get a specific search by ID
router.get('/searches/:id', async (req, res) => {
  try {
    const searchId = parseInt(req.params.id);
    
    if (isNaN(searchId)) {
      return res.status(400).json({ error: 'Invalid search ID' });
    }

    const [search] = await db
      .select()
      .from(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.id, searchId))
      .limit(1);

    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }

    res.json(search);
  } catch (error) {
    console.error('Error fetching Mastercard search:', error);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

// Clear all completed searches (admin function)
router.delete('/searches/clear/completed', async (req, res) => {
  try {
    const result = await db
      .delete(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.status, 'completed'));

    res.json({ 
      success: true, 
      message: 'Completed searches cleared'
    });
  } catch (error) {
    console.error('Error clearing completed searches:', error);
    res.status(500).json({ error: 'Failed to clear completed searches' });
  }
});

// Clear all failed searches (admin function)
router.delete('/searches/clear/failed', async (req, res) => {
  try {
    const result = await db
      .delete(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.status, 'failed'));

    res.json({ 
      success: true, 
      message: 'Failed searches cleared'
    });
  } catch (error) {
    console.error('Error clearing failed searches:', error);
    res.status(500).json({ error: 'Failed to clear failed searches' });
  }
});

export default router;