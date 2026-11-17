// arkhive-speech: macOS speech recognition for Arkhive's mic (the app's webview cannot run speech input).
// Prints one line per event: "<kind>\t<text>", kind = ready | partial | final | error. Exits after a final result,
// an error, or when stdin closes. A pause of 1.4 s after speech counts as the end of a phrase.
import AVFoundation
import Foundation
import Speech

setvbuf(stdout, nil, _IOLBF, 0)
func emit(_ kind: String, _ text: String = "") {
    print(kind + "\t" + text.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\t", with: " "))
}
func fail(_ reason: String, _ code: Int32) -> Never { emit("error", reason); exit(code) }

let engine = AVAudioEngine()
var task: SFSpeechRecognitionTask?
var last = ""
var pause: DispatchWorkItem?

func finish() {
    emit("final", last)
    engine.stop()
    exit(0)
}

func start() {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), recognizer.isAvailable else {
        fail("English speech recognition is not available on this Mac", 3)
    }
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.channelCount > 0 else { fail("no microphone was found", 4) }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
    engine.prepare()
    do { try engine.start() } catch { fail("the microphone could not start (\(error.localizedDescription))", 5) }
    emit("ready")
    task = recognizer.recognitionTask(with: request) { result, error in
        if let result = result {
            last = result.bestTranscription.formattedString
            if result.isFinal { return finish() }
            emit("partial", last)
            pause?.cancel()
            let item = DispatchWorkItem { finish() }
            pause = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4, execute: item)
        } else if let error = error {
            fail(error.localizedDescription, 6)
        }
    }
}

switch AVCaptureDevice.authorizationStatus(for: .audio) {
case .denied, .restricted: fail("microphone access was refused in System Settings", 2)
default: break
}
SFSpeechRecognizer.requestAuthorization { status in
    switch status {
    case .authorized: DispatchQueue.main.async { start() }
    case .denied: fail("speech recognition was refused in System Settings", 2)
    case .restricted: fail("speech recognition is restricted on this Mac", 2)
    default: fail("speech recognition is not allowed", 2)
    }
}
DispatchQueue.global().async { // the app closes stdin to stop listening
    while readLine() != nil {}
    exit(0)
}
RunLoop.main.run()
