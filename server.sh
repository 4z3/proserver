#! /bin/sh
set -euf

date="`date --rfc-3339=s`"
echo "$date $METHOD $URL" >&2

prn() {
  printf '%s\r\n' "$*"
}

chunk() {
  set -- "$*"
  prn "`echo "obase=16;${#1}"|bc`"
  prn "$1"
}

not_found() {
    prn HTTP/1.1 404 Not Found
    prn Content-Length: 0
    prn Connection: close
    prn
}

method_not_allowed() {
    prn HTTP/1.1 405 Method Not Allowed
    prn Content-Length: 0
    prn Connection: close
    prn
}

input_text() {
  echo -n "<label for=\"$1\">$3</label>"
  echo -n "<input id=\"$1\" type=\"text\" name=\"$1\" value=\"$2\">"
}

input_file() {
  echo -n "<label for=\"$1\">$3</label>"
  echo -n "<input id=\"$1\" type=\"file\" name=\"$1\" accept=\"$2\">"
}

homepage=/
homepage() {
  prn HTTP/1.1 200 OK
  prn Transfer-Encoding: chunked
  prn
  chunk "
<!doctype html>
<title>homepage</title>
<h1>homepage</h1>
<a href='$account_overview'>login</a>
"
  chunk
}

account_overview=/`echo -n account overview | sha1sum | awk '{print$1}'`
account_overview() {
  prn HTTP/1.1 200 OK
  prn Transfer-Encoding: chunked
  prn
  chunk "
<!doctype html>
<title>account overview</title>
<h1>account overview</h1>
<a href='$homepage'>logout</a>
<h2>applicatives</h2>
<a href='$espresso_build_apk'>espresso build apk</a>
"
  chunk
}

espresso_build_apk=/`echo -n espresso build apk | sha1sum | awk '{print$1}'`
espresso_build_apk() {
  # TODO Content-Type
  prn HTTP/1.1 200 OK
  prn Transfer-Encoding: chunked
  prn
  chunk '
<!doctype html>
<style>
label:after {
  content:": ";
}
</style>
<title>espresso build apk</title>
<h1>espresso build apk</h1>
<form method="post" enctype="multipart/form-data">

  <fieldset><legend>upload configuration</legend>
    <ul>
      <li>'"$(input_file archive application/zip 'Source archive')"'</li>
    </ul>
  </fieldset>

  <fieldset><legend>espresso build configuration</legend>
  </fieldset>

  <fieldset><legend>package configuration</legend>
    <ul>
      <li>
        <label for="sdk">SDK</label>
        <select id="sdk" name="sdk">
          <option selected="selected" value="android-7">Android 2.1</option>
        </select>
      </li>
      <li>'"$(input_text package com.test.helloworld 'Package name')"'</li>
      <li>'"$(input_text activity HelloWorld 'Activity name')"'</li>
    </ul>
  </fieldset>

  <fieldset><legend>download configuration</legend>
    <ul>
      <li>'"$(input_text filename HelloWorld.apk 'Download filename')"'</li>
    </ul>
  </fieldset>

  <input type="submit" value="apply">
</form>
'
  chunk
}

espresso_build_apk_apply() {
  prn HTTP/1.1 200 OK
  prn Transfer-Encoding: chunked
  prn Content-Type: text/plain
  prn
  chunk "`env`"
  chunk
}

case "$URL" in
  ($homepage)
    case "$METHOD" in
      (GET) homepage ;;
      (*) method_not_allowed ;;
    esac
    ;;
  ($account_overview)
    case "$METHOD" in
      (GET) account_overview ;;
      (*) method_not_allowed ;;
    esac
    ;;
  ($espresso_build_apk)
    case "$METHOD" in
      (GET) espresso_build_apk ;;
      (POST) espresso_build_apk_apply ;;
      (*) method_not_allowed ;;
    esac
    ;;
  (*)
    not_found
    ;;
esac