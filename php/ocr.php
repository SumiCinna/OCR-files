<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

function respond(bool $success, string $text = '', string $error = '', int $pages = 1): void {
    echo json_encode(compact('success', 'text', 'error', 'pages'));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, '', 'Method not allowed.');
}

$apiKey = 'K84047214388957';

if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    respond(false, '', 'No file uploaded or upload error.');
}

$file = $_FILES['file'];
$tmpPath = $file['tmp_name'];
$origName = $file['name'];
$mimeType = mime_content_type($tmpPath);

$allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
if (!in_array($mimeType, $allowedMimes)) {
    respond(false, '', "Unsupported file type: {$mimeType}. Use PDF or image files.");
}

if (filesize($tmpPath) > 5 * 1024 * 1024) {
    respond(false, '', 'File too large. OCR.space free tier limit is 5 MB.');
}

$postFields = [
    'apikey' => $apiKey,
    'language' => 'auto',
    'isOverlayRequired' => 'true',
    'detectOrientation' => 'true',
    'scale' => 'true',
    'isTable' => 'true',
    'OCREngine' => '2',
    'file' => new CURLFile($tmpPath, $mimeType, $origName),
];

$result = runOcrRequest($postFields);
if (!$result['success'] || empty($result['text'])) {
    $fallbackFields = $postFields;
    $fallbackFields['OCREngine'] = '3';
    $fallbackFields['language'] = 'eng';
    $result = runOcrRequest($fallbackFields);
}

if (!$result['success']) {
    respond(false, '', $result['error'] ?: 'OCR processing failed.');
}

if ($result['text'] === '') {
    respond(false, '', 'No text detected in the file.');
}

respond(true, $result['text'], '', $result['pages']);

function runOcrRequest(array $postFields): array {
    $ch = curl_init('https://api.ocr.space/parse/image');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postFields,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        return [
            'success' => false,
            'text' => '',
            'error' => 'Connection error: ' . $curlErr,
            'pages' => 1,
        ];
    }

    $data = json_decode($response, true);
    if (!$data) {
        return [
            'success' => false,
            'text' => '',
            'error' => 'Invalid response from OCR.space.',
            'pages' => 1,
        ];
    }

    if (!empty($data['IsErroredOnProcessing']) && $data['IsErroredOnProcessing']) {
        $errMsg = $data['ErrorMessage'][0] ?? $data['ErrorDetails'] ?? 'OCR processing failed.';
        return [
            'success' => false,
            'text' => '',
            'error' => $errMsg,
            'pages' => 1,
        ];
    }

    $extractedText = '';
    $pageCount = 0;

    foreach ($data['ParsedResults'] ?? [] as $page) {
        $pageCount++;

        $pageText = buildPageText($page);
        if ($pageText === '') {
          $pageText = trim((string) ($page['ParsedText'] ?? ''));
        }

        if ($pageText !== '') {
            $extractedText .= $pageText . "\n";
        }
    }

    return [
        'success' => true,
        'text' => trim($extractedText),
        'error' => '',
        'pages' => max(1, $pageCount),
    ];
}

function buildPageText(array $page): string {
    $overlay = $page['TextOverlay']['Lines'] ?? [];

    if (empty($overlay) || !is_array($overlay)) {
        return '';
    }

    $lineItems = [];

    foreach ($overlay as $line) {
        $lineWords = $line['Words'] ?? [];
        if (empty($lineWords) || !is_array($lineWords)) {
            continue;
        }

        usort($lineWords, static function (array $left, array $right): int {
            $leftPos = (int) ($left['Left'] ?? 0);
            $rightPos = (int) ($right['Left'] ?? 0);

            if ($leftPos === $rightPos) {
                return ((int) ($left['Top'] ?? 0)) <=> ((int) ($right['Top'] ?? 0));
            }

            return $leftPos <=> $rightPos;
        });

        $lineText = implode(' ', array_map(static function (array $word): string {
            return trim((string) ($word['WordText'] ?? ''));
        }, $lineWords));

        $lineText = trim(preg_replace('/\s+/', ' ', $lineText));
        if ($lineText === '') {
            continue;
        }

        $lineItems[] = [
            'left' => (int) ($lineWords[0]['Left'] ?? 0),
            'top' => (int) ($line['MinTop'] ?? ($lineWords[0]['Top'] ?? 0)),
            'right' => (int) max(array_map(static function (array $word): int {
                return (int) ($word['Left'] ?? 0) + (int) ($word['Width'] ?? 0);
            }, $lineWords)),
            'text' => $lineText,
        ];
    }

    if (empty($lineItems)) {
        return '';
    }

    $columns = [];

    foreach ($lineItems as $item) {
        $placed = false;
        foreach ($columns as &$column) {
            $columnLeft = $column['leftSum'] / max(1, $column['count']);
            if (abs($item['left'] - $columnLeft) <= 120) {
                $column['items'][] = $item;
                $column['leftSum'] += $item['left'];
                $column['count']++;
                $placed = true;
                break;
            }
        }
        unset($column);

        if (!$placed) {
            $columns[] = [
                'leftSum' => $item['left'],
                'count' => 1,
                'items' => [$item],
            ];
        }
    }

    usort($columns, static function (array $left, array $right): int {
        $leftAvg = $left['leftSum'] / max(1, $left['count']);
        $rightAvg = $right['leftSum'] / max(1, $right['count']);
        return $leftAvg <=> $rightAvg;
    });

    $lines = [];

    foreach ($columns as $columnIndex => $column) {
        usort($column['items'], static function (array $left, array $right): int {
            if ($left['top'] === $right['top']) {
                return $left['left'] <=> $right['left'];
            }

            return $left['top'] <=> $right['top'];
        });

        $previousTop = null;
        foreach ($column['items'] as $item) {
            if ($previousTop !== null && ($item['top'] - $previousTop) > 18) {
                $lines[] = '';
            }

            $lines[] = $item['text'];
            $previousTop = $item['top'];
        }

        if ($columnIndex < count($columns) - 1) {
            $lines[] = '';
        }
    }

    return trim(implode("\n", $lines));
}
