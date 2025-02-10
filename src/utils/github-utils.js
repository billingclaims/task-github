import { Octokit } from '@octokit/rest';
import { logger } from './logger.js';

const octokit = new Octokit({ 
  auth: process.env.GITHUB_PAT,
  log: logger
});

// Core GitHub Operations
export async function createIssues(issues, assets) {
  logger.info(`Creating ${issues.length} issues...`);
  const createdIssues = [];
  
  for (const [index, issue] of issues.entries()) {
    try {
      logger.debug(`Creating issue ${index + 1}: ${issue.title.slice(0,30)}...`);
      
      const { data } = await octokit.issues.create({
        owner: process.env.GITHUB_REPO_OWNER,
        repo: process.env.GITHUB_REPO_NAME,
        title: issue.title,
        body: `${issue.body}\n\n${assets.images.map(url => `![image](${url})`).join('\n')}`,
        labels: issue.labels
      });
      
      createdIssues.push(data);
      logger.info(`Created issue #${data.number}: ${data.html_url}`);
    } catch (error) {
      logger.error(`Issue creation failed: ${error.message}`, { issue });
      throw error;
    }
  }
  
  return createdIssues;
}

// Project Management
export async function getProjectDetails() {
  logger.info('Fetching GitHub project details...');
  
  const variables = {
    projectNumber: parseInt(process.env.GITHUB_PROJECT_NUMBER, 10),
    owner: process.env.GITHUB_REPO_OWNER.trim()
  };

  const query = `
    query getProjectNode($owner: String!, $projectNumber: Int!) {
      organization(login: $owner) {
        projectV2(number: $projectNumber) {  
          id
        }
      }
    }
  `;

  try {
    const response = await octokit.graphql({ query, ...variables });
    return response.organization?.projectV2?.id;
  } catch (error) {
    logger.error('Failed to fetch project details', { error });
    throw error;
  }
}

export async function getStatusField(projectId) {
  logger.info(`Fetching status field for project ${projectId}...`);
  
  const query = `
    query ($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await octokit.graphql({ query, projectId });
    return response.node.fields.nodes.find(f => f?.name === 'Status');
  } catch (error) {
    logger.error('Failed to fetch status field', { error });
    throw error;
  }
}

export async function getProjectItems(projectId) {
  logger.info(`Fetching items for project ${projectId}...`);
  
  const query = `
    query ($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  optionId
                }
              }
              content {
                ... on Issue {
                  number
                  title
                  url
                  body
                  assignees(first: 5) {
                    nodes {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await octokit.graphql({ query, projectId });
    return response.node.items.nodes.filter(item => item.content);
  } catch (error) {
    logger.error('Failed to fetch project items', { error });
    throw error;
  }
}

export async function listOpenIssues() {
  logger.info('Listing open issues...');
  try {
    const projectId = await getProjectDetails();
    const statusField = await getStatusField(projectId);
    const items = await getProjectItems(projectId);
    
    return processProjectItems(items, statusField);
  } catch (error) {
    logger.error('Failed to list open issues', { error });
    throw error;
  }
}

function processProjectItems(items, statusField) {
  logger.debug(`Processing ${items.length} project items...`);
  
  const backlogOption = statusField.options.find(o => o.name === 'Backlog');
  const doneOption = statusField.options.find(o => o.name === 'Done');

  return items.filter(item => {
    const status = item.fieldValueByName?.name;
    return status && status !== doneOption?.name;
  }).sort((a, b) => {
    if (a.fieldValueByName?.optionId === backlogOption?.id) return -1;
    if (b.fieldValueByName?.optionId === backlogOption?.id) return 1;
    return 0;
  });
} 