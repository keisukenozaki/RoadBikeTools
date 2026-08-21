<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// 設定ファイル
$configFile = __DIR__ . '/config.php';

if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode([
        "error" => "設定ファイル(config.php)が存在しません"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$config = require $configFile;

$segmentId = $_GET['id'] ?? '';

if (empty($segmentId) || !ctype_digit($segmentId)) {
    http_response_code(400);
    echo json_encode([
        "error" => "無効な Segment ID です"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}


// --------------------------------------------------
// Stravaアクセストークン取得
// --------------------------------------------------

function getValidAccessToken($config)
{
    $clientId = $config['strava']['client_id'];
    $clientSecret = $config['strava']['client_secret'];
    $refreshToken = $config['strava']['refresh_token'];

    $ch = curl_init('https://www.strava.com/oauth/token');

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'grant_type' => 'refresh_token',
            'refresh_token' => $refreshToken,
        ]),
        CURLOPT_SSL_VERIFYPEER => false,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($httpCode !== 200) {
        return null;
    }

    $data = json_decode($response, true);

    return $data['access_token'] ?? null;
}


// --------------------------------------------------
// アクセストークン取得
// --------------------------------------------------

$accessToken = getValidAccessToken($config);

if (!$accessToken) {
    http_response_code(500);

    echo json_encode([
        "error" => "アクセストークンの取得に失敗しました"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// Strava Streams API
// --------------------------------------------------

$url =
    "https://www.strava.com/api/v3/segments/" .
    $segmentId .
    "/streams" .
    "?keys=distance,altitude,grade_smooth" .
    "&key_by_type=true";


$ch = curl_init($url);

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . $accessToken
    ],
    CURLOPT_SSL_VERIFYPEER => false,
]);

$response = curl_exec($ch);

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);


// --------------------------------------------------
// Strava APIエラー
// --------------------------------------------------

if ($httpCode !== 200) {

    http_response_code($httpCode);

    echo json_encode([
        "error" => "Strava Streams APIからのデータ取得に失敗しました",
        "status" => $httpCode
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// JSON解析
// --------------------------------------------------

$data = json_decode($response, true);

if ($data === null) {

    http_response_code(500);

    echo json_encode([
        "error" => "Stravaから返されたJSONを解析できませんでした"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// Angularへ返却
// --------------------------------------------------

echo json_encode(
    $data,
    JSON_UNESCAPED_UNICODE
);