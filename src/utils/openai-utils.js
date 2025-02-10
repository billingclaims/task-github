import { OpenAI } from 'openai';
import { z } from 'zod';
import { logger } from './logger.js';
import fetch from 'node-fetch';

const openai = new OpenAI();

export const IssueSchema = z.array(
  z.object({
    title: z.string().min(10).describe("Technical summary of the issue"),
    body: z.string().min(100).describe("Markdown formatted issue description with sections"),
    labels: z.array(z.string().min(2).max(20).describe("Relevant tags for categorizing the issue")).default([])
  })
);

// Add this above the generateIssueContent function
export const IssueTemplates = {
    BUG: {
      titlePrefix: '',
      body: `## Description\n\n{{concise_summary}}\n\n## Steps to Reproduce\n1. {{step_1}}\n2. {{step_2}}\n3. {{step_3}}\n\n## Expected Behavior\n{{expected}}\n\n## Actual Behavior\n{{actual}}\n\n**Environment:**\n- OS: {{OS}}\n- Version: {{version}}`,
      labels: ['bug']
    },
    FEATURE: {
      titlePrefix: '',
      body: `## Problem Statement\n{{problem_description -- make this brief and concise}}\n\n## Proposed Solution\n{{solution_details}}\n\n## Alternatives Considered\n{{alternatives}}\n\n## Additional Context\n{{context}}`,
      labels: ['enhancement']
    },
    ENHANCEMENT: {
      titlePrefix: '',
      body: `## Current Behavior\n{{current_state}}\n\n## Proposed Improvement\n{{improvement_details}}\n\n## Expected Benefits\n{{benefits}}\n\n## Implementation Notes\n{{notes}}`,
      labels: ['enhancement']
    },
    PERFORMANCE: {
      titlePrefix: '',
      body: `## Affected Component\n{{component}}\n\n## Current Performance\n{{metrics}}\n\n## Performance Targets\n{{targets}}\n\n## Benchmark Results\n{{results}}\n\n## Optimization Strategies\n{{strategies}}`,
      labels: ['performance']
    }
  };

export async function generateIssueContent({ text, images }, channel) {
  logger.info('Starting AI content generation', { textLength: text.length, imageCount: images.length });

  try {
    const imageContents = await processImages(images, channel);
    const messages = buildMessages(text, imageContents);
    
    logger.debug('Starting OpenAI streaming request');
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
      stream: true
    });

    return handleAIStream(stream, channel);
  } catch (error) {
    logger.error('AI content generation failed', { error });
    throw error;
  }
}

async function processImages(images, channel) {
  return Promise.all(images.map(async url => {
    try {
      logger.debug(`Processing image: ${url}`);
      const dataUrl = await fetchImageAsBase64(url);
      return { type: 'image_url', image_url: { url: dataUrl } };
    } catch (error) {
      logger.warn(`Skipping image ${url}: ${error.message}`);
      await channel.send(`⚠️ Skipping image: ${error.message}`);
      return null;
    }
  })).then(results => results.filter(Boolean));
}

async function fetchImageAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type');
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function buildMessages(text, imageContents) {
  return [{
    role: 'system',
    content: `Analyze input to identify multiple distinct issues. Always return JSON array of issues with:
      1. Separate technical concerns into individual issues
      2. Maintain atomicity (each issue solves one problem)
      3. Follow same schema as single issues
      4. Add labels to each issue from its content
      5. Use appropriate template for each issue type
      ${JSON.stringify(IssueTemplates, null, 2)}
      JSON Schema Requirements:
      ${JSON.stringify(IssueSchema.element.shape, null, 2)}
      
      Guidelines:
      1. Create separate issues for unrelated problems
      2. Group related but separate concerns into individual tickets
      3. Ensure each issue has clear ownership boundaries
      4. Add cross-references between related issues
      5. Include dependencies between issues where applicable
      6. Even it is a single issue, return a JSON array with issues property having one issue`

  }, {
    role: 'user',
    content: [
      { type: 'text', text: text.join('\n\n') },
      ...imageContents
    ]
  }];
}

async function handleAIStream(stream, channel) {
  let contentBuffer = '';
  const statusMessage = await channel.send('Starting generation...');

  try {
    for await (const chunk of stream) {
      contentBuffer += chunk.choices[0]?.delta?.content || '';
      await updateStatusMessage(contentBuffer, statusMessage);
    }

    logger.debug('AI generation completed', { contentLength: contentBuffer.length });
    await statusMessage.edit(`✅ Generation complete!\n\`\`\`json\n${contentBuffer.slice(-1950)}\n\`\`\``);
    
    return validateAIResponse(contentBuffer);
  } catch (error) {
    logger.error('AI stream processing failed', { error });
    await statusMessage.edit('❌ Generation failed!');
    throw error;
  }
}

async function updateStatusMessage(content, message) {
  if (content.length % 15 === 0) {
    await message.edit(`🔄 Generating content...\n\`\`\`json\n${content.slice(-1950)}\n\`\`\``);
  }
}

function validateAIResponse(content) {
  const rawData = JSON.parse(content);
  const validation = IssueSchema.safeParse(rawData.issues);
  
  if (!validation.success) {
    logger.error('AI response validation failed', { errors: validation.error.errors });
    throw new Error(`Validation failed: ${validation.error.errors.map(e => `${e.path}: ${e.message}`).join(', ')}`);
  }

  return validation.data;
} 