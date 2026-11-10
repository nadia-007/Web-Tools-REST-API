# SlamDoc – REST API Document Converter

SlamDoc is a web-based document converter built with **ReactJS** and **FastAPI**. It provides an interactive basketball-themed experience that allows users to convert documents into different file formats through a simple and engaging interface.

Instead of using a conventional upload interface, users can interact with a virtual basketball hoop to trigger document conversion.

## Features

- REST API architecture using FastAPI.
- Interactive API documentation with Swagger UI.
- ReactJS frontend powered by Vite.
- Document conversion powered by LibreOffice.
- File upload and download functionality.
- Support for multiple document formats.
- Basketball-themed interactive user interface.
- Drag-and-shoot document interaction.
- File validation and upload progress indicator.
- No database or user authentication required.

## Supported Conversion Formats

| No. | Source Format | Target Format |
|---|---|---|
| 1 | DOCX | PDF |
| 2 | PDF | DOCX |
| 3 | MD | HTML |
| 4 | HTML | MD |
| 5 | CSV | XLSX |
| 6 | XLSX | CSV |

## Technologies Used

### Backend
- Python
- FastAPI
- Uvicorn
- LibreOffice

### Frontend
- ReactJS
- JavaScript
- Vite
- HTML5
- CSS3

### Development Tools
- Visual Studio Code
- Git
- GitHub
- npm

## Project Structure

```text
WEB REST API/
│
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── converter.py
│   │   │   ├── formats.py
│   │   │   └── health.py
│   │   │
│   │   ├── services/
│   │   │   ├── conversion_service.py
│   │   │   ├── docx_pdf.py
│   │   │   ├── markdown_html.py
│   │   │   ├── pdf_docx.py
│   │   │   └── spreadsheet.py
│   │   │
│   │   ├── utils/
│   │   │   └── file_handler.py
│   │   │
│   │   └── main.py
│   │
│   └── requirements.txt
│
├── frontend/
│   ├── public/
│   │   └── images/
│   │
│   ├── src/
│   │   ├── services/
│   │   │   └── converterApi.js
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

## Requirements

Make sure the following software is installed:

- Python
- Node.js and npm
- LibreOffice
- Git

LibreOffice is required as the document conversion engine.

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/nadia-007/Web-Tools-REST-API.git

cd Web-Tools-REST-API
```

### 2. Backend Setup

Navigate to the backend directory:

```powershell
cd backend
```

Create a Python virtual environment:

```powershell
python -m venv venv
```

Activate the virtual environment on Windows:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the required dependencies:

```powershell
pip install -r requirements.txt
```

Run the FastAPI server:

```powershell
uvicorn app.main:app --reload
```

Backend server:

http://127.0.0.1:8000

### 3. Frontend Setup

Open a new terminal and navigate to the frontend directory:

```powershell
cd frontend
```

Install the dependencies:

```powershell
npm install
```

Start the Vite development server:

```powershell
npm run dev
```

Frontend application:

http://localhost:5173

## API Documentation

SlamDoc uses FastAPI to provide REST API endpoints and automatically generated API documentation.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | API root |
| GET | `/api/health` | Check API server status |
| GET | `/api/formats` | Get supported conversion formats |
| POST | `/api/convert` | Convert an uploaded document |

### Swagger UI

The API documentation can be accessed through:

http://127.0.0.1:8000/docs

Swagger UI allows developers to explore and test the available API endpoints.

## Database

SlamDoc does not require a database or user authentication.

Documents are processed through the REST API and returned to users in the requested output format.

## Project Status

SlamDoc is currently under development.

The backend conversion functionality and basic frontend integration have been implemented. The interactive basketball animation and user experience are still being refined.

## Repository

GitHub: https://github.com/nadia-007/Web-Tools-REST-API