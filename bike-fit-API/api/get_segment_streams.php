<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// --------------------------------------------------
// 設定ファイル
// --------------------------------------------------

$configFile = __DIR__ . '/config.php';

if (!file_exists($configFile)) {

    http_response_code(500);

    echo json_encode([
        "error" =>
            "設定ファイル(config.php)が存在しません"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

$config = require $configFile;


// --------------------------------------------------
// 共通認証モジュール
// --------------------------------------------------

require_once __DIR__ . '/strava_auth.php';


// --------------------------------------------------
// Segment ID
// --------------------------------------------------

$segmentId = $_GET['id'] ?? '';

if (
    empty($segmentId) ||
    !ctype_digit($segmentId)
) {

    http_response_code(400);

    echo json_encode([
        "error" =>
            "無効な Segment ID です"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// DB接続
// --------------------------------------------------

try {

    $pdo = new PDO(
        "mysql:host={$config['db']['host']};" .
        "dbname={$config['db']['name']};" .
        "charset=utf8mb4",

        $config['db']['user'],
        $config['db']['pass'],

        [
            PDO::ATTR_ERRMODE =>
                PDO::ERRMODE_EXCEPTION,

            PDO::ATTR_DEFAULT_FETCH_MODE =>
                PDO::FETCH_ASSOC,
        ]
    );

} catch (PDOException $e) {

    http_response_code(500);

    echo json_encode([
        "error" =>
            "DB接続エラーが発生しました"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// Stravaアクセストークン取得
// --------------------------------------------------

$accessToken =
    getValidAccessToken(
        $pdo,
        $config
    );

if (!$accessToken) {

    http_response_code(500);

    echo json_encode([
        "error" =>
            "アクセストークンの取得に失敗しました"
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
    "?keys=distance,altitude" .
    "&key_by_type=true";


$ch = curl_init();

curl_setopt_array($ch, [

    CURLOPT_URL => $url,

    CURLOPT_RETURNTRANSFER => true,

    CURLOPT_SSL_VERIFYPEER => false,

    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " .
        $accessToken
    ],

]);

$response = curl_exec($ch);

$httpCode =
    curl_getinfo(
        $ch,
        CURLINFO_HTTP_CODE
    );

curl_close($ch);


// --------------------------------------------------
// APIエラー
// --------------------------------------------------

if ($httpCode !== 200) {

    http_response_code($httpCode);

    echo json_encode([

        "error" =>
            "Strava Streams APIからのデータ取得に失敗しました",

        "status" =>
            $httpCode,

    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// JSON解析
// --------------------------------------------------

$data = json_decode(
    $response,
    true
);

if ($data === null) {

    http_response_code(500);

    echo json_encode([
        "error" =>
            "Stravaから返されたJSONを解析できませんでした"
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