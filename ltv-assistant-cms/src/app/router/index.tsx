import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Container, Loader, Stack } from '@mantine/core';
import { UserRole } from '@/entities/user/model';
import { ROUTES } from '@/shared/config';
import { MainLayout } from '@/widgets/layout/ui';
import { ProtectedRoute } from '../providers/ProtectedRoute';

// Lazy load pages
const LoginPage = lazy(() =>
  import('@/pages/login/ui').then((module) => ({ default: module.LoginPage }))
);
const AuthCallbackPage = lazy(() =>
  import('@/pages/auth-callback/ui').then((module) => ({
    default: module.AuthCallbackPage,
  }))
);
const DashboardPage = lazy(() =>
  import('@/pages/dashboard/ui').then((module) => ({
    default: module.DashboardPage,
  }))
);
const UserManagementPage = lazy(() =>
  import('@/pages/user-management/ui').then((module) => ({
    default: module.UserManagementPage,
  }))
);
const PersonalTokensPage = lazy(() =>
  import('@/pages/personal-tokens/ui').then((module) => ({
    default: module.PersonalTokensPage,
  }))
);
const UserTokensAdminPage = lazy(() =>
  import('@/pages/user-tokens-admin/ui').then((module) => ({
    default: module.UserTokensAdminPage,
  }))
);
const UserSessionsAdminPage = lazy(() =>
  import('@/pages/user-sessions-admin/ui').then((module) => ({
    default: module.UserSessionsAdminPage,
  }))
);
const DocumentsPage = lazy(() =>
  import('@/pages/documents/ui/DocumentsPage').then((module) => ({
    default: module.DocumentsPage,
  }))
);
const CreateDocumentPage = lazy(() =>
  import('@/pages/documents/ui/CreateDocumentPage').then((module) => ({
    default: module.CreateDocumentPage,
  }))
);
const DocumentDetailsPage = lazy(() =>
  import('@/pages/documents/ui/DocumentDetailsPage').then((module) => ({
    default: module.DocumentDetailsPage,
  }))
);
const EditDocumentPage = lazy(() =>
  import('@/pages/documents/ui/EditDocumentPage').then((module) => ({
    default: module.EditDocumentPage,
  }))
);
const FileDetailsPage = lazy(() =>
  import('@/pages/files/ui/FileDetailsPage').then((module) => ({
    default: module.FileDetailsPage,
  }))
);
const RetrievalPage = lazy(() =>
  import('@/pages/retrieval/ui').then((module) => ({
    default: module.RetrievalPage,
  }))
);
const EvaluationDashboardPage = lazy(() =>
  import('@/pages/evaluation/EvaluationDashboardPage').then((module) => ({
    default: module.EvaluationDashboardPage,
  }))
);
const RunEvaluationPage = lazy(() =>
  import('@/pages/evaluation/RunEvaluationPage').then((module) => ({
    default: module.RunEvaluationPage,
  }))
);
const FilesManagementPage = lazy(() =>
  import('@/pages/evaluation/FilesManagementPage').then((module) => ({
    default: module.FilesManagementPage,
  }))
);
const DatasetsPage = lazy(() =>
  import('@/pages/evaluation/DatasetsPage').then((module) => ({
    default: module.DatasetsPage,
  }))
);
const DatasetQuestionsPage = lazy(() =>
  import('@/pages/evaluation/DatasetQuestionsPage').then((module) => ({
    default: module.DatasetQuestionsPage,
  }))
);
const DatasetFilesPage = lazy(() =>
  import('@/pages/evaluation/DatasetFilesPage').then((module) => ({
    default: module.DatasetFilesPage,
  }))
);
const JobHistoryPage = lazy(() =>
  import('@/pages/evaluation/JobHistoryPage').then((module) => ({
    default: module.JobHistoryPage,
  }))
);

// Loading fallback component
function PageLoader() {
  return (
    <Container
      size="xs"
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack align="center" gap="md">
        <Loader size="lg" />
      </Stack>
    </Container>
  );
}

// Suspense wrapper for lazy loaded routes
function SuspenseWrapper() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

// Main layout wrapper for protected routes
function MainLayoutWrapper() {
  return (
    <MainLayout>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </MainLayout>
  );
}

export const router = createBrowserRouter([
  {
    element: <SuspenseWrapper />,
    children: [
      {
        path: ROUTES.HOME,
        element: <Navigate to={ROUTES.LOGIN} replace />,
      },
      {
        path: ROUTES.LOGIN,
        element: <LoginPage />,
      },
      {
        path: ROUTES.AUTH_CALLBACK,
        element: <AuthCallbackPage />,
      },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <MainLayoutWrapper />
      </ProtectedRoute>
    ),
    children: [
      {
        path: ROUTES.DASHBOARD,
        element: <DashboardPage />,
      },
      {
        path: ROUTES.USER_MANAGEMENT,
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <UserManagementPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.PERSONAL_TOKENS,
        element: <PersonalTokensPage />,
      },
      {
        path: ROUTES.USER_TOKENS_ADMIN,
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <UserTokensAdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.USER_SESSIONS_ADMIN,
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <UserSessionsAdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/documents',
        element: (
          <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
            <DocumentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/documents/new',
        element: (
          <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
            <CreateDocumentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/documents/:id',
        element: (
          <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
            <DocumentDetailsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/documents/:id/edit',
        element: (
          <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
            <EditDocumentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/files/:fileId',
        element: (
          <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
            <FileDetailsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.RETRIEVAL,
        element: (
          <ProtectedRoute>
            <RetrievalPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.EVALUATION_DASHBOARD,
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <EvaluationDashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.EVALUATION_RUN,
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <RunEvaluationPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.EVALUATION_FILES,
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <FilesManagementPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.EVALUATION_DATASETS,
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <DatasetsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/evaluation/datasets/:datasetId/questions',
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <DatasetQuestionsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/evaluation/datasets/:datasetId/files',
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <DatasetFilesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.EVALUATION_JOBS,
        element: (
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <JobHistoryPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
