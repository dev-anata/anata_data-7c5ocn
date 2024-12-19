I need you to develop an MVP for a platform that automates the following tasks, with the following emphasis: I want full backend and infrastructure functionality to be built in a modular and scalable way, but I want to manually fill in the specific logic for both web scraping and document processing. Ensure these parts are clearly separated and modular.

### **Platform Requirements:**

1. **Web Scraping and API Integration**

   - Build a modular framework for scraping data from the websites of large pharmaceutical companies and pulling data from relevant APIs. This part should:

     - Include placeholder scripts or templates for the scraping logic so I can manually adjust it later.

     - Provide hooks or configuration files where new target websites or APIs can easily be added.

   - Store the raw scraped and API data in **Google Cloud Storage (GCS)** with metadata (e.g., source, timestamp).

   - Ensure that all scraping and API tasks are scheduled to run every morning using **Google Cloud Scheduler**.

   - Include logging and monitoring for scraping jobs to track successes, failures, and retries.

2. **Document Ingestion and Processing**

   - Create a separate pipeline for ingesting regulatory documents (PDFs, images, or text files) that:

     - Accepts uploads via an API or manual file upload.

     - Runs OCR (e.g., Tesseract) to extract text.

     - Applies NLP (e.g., entity extraction, summarization) to analyze and extract insights.

   - This part should:

     - Include placeholder logic for OCR and NLP so I can manually define custom processing steps later.

     - Store processed text and insights in **BigQuery** with a structured schema for querying.

   - Keep this pipeline entirely independent of the web scraping module, so I can separately develop and adjust these workflows.

3. **Dataset Creation and API**

   - Transform both the scraped/API data and the processed document data into structured datasets stored in BigQuery.

   - Develop a RESTful API with endpoints to:

     - Query datasets with filters (e.g., company, regulatory category, or date).

     - Retrieve raw data or specific records.

     - Download datasets in CSV or JSON format.

   - Secure the API with basic authentication (API keys).

4. **Infrastructure Setup**

   - Use Google Cloud for hosting and infrastructure:

     - **GCS**: Store raw and processed data.

     - **BigQuery**: Store structured datasets.

     - **Cloud Run**: Host APIs and pipelines.

     - **Cloud Scheduler**: Automate daily scraping jobs.

   - Separate the scraping and document processing modules, with clear integration points for connecting them if needed in the future.

5. **Customization and Modularity**

   - Design all scraping and processing scripts to be modular, with clear placeholders where I can:

     - Define scraping logic for specific websites.

     - Add or adjust API integrations.

     - Define custom OCR or NLP logic for document processing.

   - Document how to connect these independent modules if needed.

### **Deliverables:**

1. **Functional Codebase**:

   - A backend system with separate modules for:

     - Web scraping and API integrations.

     - Regulatory document ingestion and processing.

   - REST API to query and access datasets.

2. **Deployment and Infrastructure**:

   - Deploy the system to Google Cloud.

   - Provide setup instructions or scripts (e.g., Terraform) for infrastructure creation.

3. **Documentation**:

   - Clear instructions on:

     - Adding or adjusting web scraping logic.

     - Customizing document processing logic.

     - Using the API to query datasets.

   - Include comments in placeholder code to guide manual adjustments.

4. **Routine Automation**:

   - All web scraping and API tasks must run automatically every morning.

   - Include logs for monitoring and debugging daily runs.

5. **Roadmap for Future Enhancements**:

   - Suggestions for integrating the scraping and document processing workflows if needed.

   - Recommendations for scaling the system as data sources grow.

### **Key Notes:**

- The web scraping and document ingestion modules must be independent and clearly separated to allow me to manually fill in the specific logic.

- The backend and infrastructure must be fully functional and scalable, with modularity to handle future expansions.

- All scraping and API tasks must be automated to run daily, with robust logging and retry mechanisms.